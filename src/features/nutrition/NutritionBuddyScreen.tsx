import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Text, View } from "react-native";
import {
  Camera, ChevronLeft, ChevronRight, History, Image as ImageIcon, Plus,
  Settings2, Sparkles, Trash2
} from "lucide-react-native";

import { useAnthraTheme } from "../../design-system";
import { Button, Card, InteractiveCard, ProgressBar, ResponsiveFieldRow, ScreenShell, SectionHeader, SheetDialog, SkeletonCard, StatusBanner, TextField } from "../../components/ui";
import { useAccount } from "../account/AccountProvider";
import { dailyTotals, goalProgressForTotals, groupEntriesByMeal, safeNutrient, scaleNutrients } from "./nutritionCalculations";
import {
  deleteNutritionEntry, getNutritionDateRange, getNutritionEntriesForDate, getNutritionGoals,
  getRecentNutritionFoods, saveCustomNutritionFood, saveNutritionEntry, saveNutritionGoals
} from "./nutritionRepository";
import { chooseAndCompressMealImage, SupabaseNutritionImageAnalyzer } from "./nutritionImageAnalyzer";
import { syncNutrition } from "./nutritionSync";
import { supabase } from "../../services/supabaseClient";
import type {
  NutritionCatalogueFood, NutritionEntry, NutritionEntryDraft, NutritionGoals,
  NutritionItemDraft, NutritionMealType, NutritionSource
} from "./nutritionTypes";

const MEALS: Array<{ key: NutritionMealType; label: string }> = [
  { key: "breakfast", label: "Breakfast" }, { key: "lunch", label: "Lunch" },
  { key: "dinner", label: "Dinner" }, { key: "snack", label: "Snacks" }
];

const DEFAULT_GOALS: NutritionGoals = {
  id: "default", ownerId: null, calorieGoal: 2000, proteinGoalGrams: 100,
  carbohydrateGoalGrams: 250, fatGoalGrams: 65, fibreGoalGrams: null, updatedAt: 0
};

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function shiftDay(key: string, amount: number): string {
  const date = new Date(`${key}T12:00:00`); date.setDate(date.getDate() + amount); return dateKey(date);
}

function localTimezone(): string { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; }
function consumedAtForDate(key: string): number {
  const now = new Date(); const date = new Date(`${key}T12:00:00`);
  date.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds()); return date.getTime();
}
function numberText(value: number | null | undefined): string { return value == null ? "" : String(Math.round(value * 10) / 10); }
function parsed(value: string, nullable = true): number | null {
  if (!value.trim()) return nullable ? null : 0;
  const result = Number(value); return Number.isFinite(result) && result >= 0 ? result : null;
}

function emptyItem(name = ""): NutritionItemDraft {
  return {
    name, servingQuantity: 1, servingUnit: "serving", servingGrams: null,
    calories: null, proteinGrams: null, carbohydrateGrams: null, fatGrams: null,
    fibreGrams: null, sugarGrams: null, sodiumMilligrams: null,
    nutrientSource: "user_entered", nutrientSourceRef: null,
    servingAssumption: "Nutrition entered for the serving shown", confidence: null
  };
}

function fromCatalogue(food: NutritionCatalogueFood): NutritionItemDraft {
  return { ...food, foodId: food.id, confidence: null };
}

function Macro({ label, value, goal }: { label: string; value: number | null; goal: number | null }) {
  const theme = useAnthraTheme();
  return (
    <View style={{ flex: 1, minWidth: 88, maxWidth: "100%" }}>
      <Text numberOfLines={1} style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>{label}</Text>
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.75}
        maxFontSizeMultiplier={1.3}
        style={[theme.typography.titleSmall, { color: theme.colors.textPrimary, marginTop: theme.spacing.xs }]}
      >
        {Math.round(safeNutrient(value))}{goal ? ` / ${Math.round(goal)}g` : "g"}
      </Text>
      {goal ? <ProgressBar value={safeNutrient(value)} max={goal} style={{ marginTop: theme.spacing.sm }} /> : null}
    </View>
  );
}

type EditorState = { draft: NutritionEntryDraft; rememberAs?: "food" | "supplement" | "packaged"; barcode?: string };

const SUPPLEMENT_TEMPLATES = [
  { name: "Whey protein", unit: "scoop" }, { name: "Creatine monohydrate", unit: "scoop" },
  { name: "Pre-workout", unit: "scoop" }, { name: "Protein bar", unit: "bar" },
  { name: "Multivitamin", unit: "tablet" }, { name: "Omega-3", unit: "capsule" }
] as const;

export function NutritionBuddyScreen({ onBack }: { onBack: () => void }) {
  const theme = useAnthraTheme();
  const account = useAccount();
  const [selectedDate, setSelectedDate] = useState(dateKey(new Date()));
  const [entries, setEntries] = useState<NutritionEntry[]>([]);
  const [weekEntries, setWeekEntries] = useState<NutritionEntry[]>([]);
  const [goals, setGoals] = useState(DEFAULT_GOALS);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [goalsOpen, setGoalsOpen] = useState(false);
  const [goalFields, setGoalFields] = useState({ calories: "", protein: "", carbs: "", fat: "", fibre: "" });
  const [saving, setSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [recent, setRecent] = useState<NutritionCatalogueFood[]>([]);
  const [quickSearch, setQuickSearch] = useState("");
  const quantityBases = useRef(new Map<string, NutritionItemDraft>());

  const beginEditor = (state: EditorState) => { quantityBases.current.clear(); setEditor(state); };

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const selected = new Date(`${selectedDate}T12:00:00`);
      const start = new Date(selected); start.setDate(selected.getDate() - ((selected.getDay() + 6) % 7));
      const end = new Date(start); end.setDate(start.getDate() + 6);
      const [nextEntries, nextGoals, nextWeek, nextRecent] = await Promise.all([
        getNutritionEntriesForDate(selectedDate), getNutritionGoals(),
        getNutritionDateRange(dateKey(start), dateKey(end)), getRecentNutritionFoods()
      ]);
      setEntries(nextEntries); setGoals(nextGoals); setWeekEntries(nextWeek); setRecent(nextRecent);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not load nutrition history.");
    } finally { setLoading(false); }
  }, [selectedDate]);

  useEffect(() => { refresh().catch(() => undefined); }, [refresh]);
  useEffect(() => {
    if (!supabase || !account.user?.id) return;
    syncNutrition(supabase, account.user.id).catch(() => undefined);
  }, [account.user?.id, entries.length, goals.updatedAt]);

  const totals = useMemo(() => dailyTotals(entries), [entries]);
  const grouped = useMemo(() => groupEntriesByMeal(entries), [entries]);
  const progress = goalProgressForTotals(totals, goals);
  const weekTotals = useMemo(() => dailyTotals(weekEntries), [weekEntries]);
  const daysLogged = new Set(weekEntries.map((entry) => entry.localDate)).size;
  const displayDate = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" }).format(new Date(`${selectedDate}T12:00:00`));

  const openManual = (source: NutritionSource = "manual", item = emptyItem()) => {
    setAddOpen(false);
    beginEditor({
      draft: { mealType: "snack", source, consumedAt: consumedAtForDate(selectedDate), localDate: selectedDate, timezone: localTimezone(), items: [item] },
      rememberAs: source === "supplement" ? "supplement" : undefined
    });
  };

  const openSupplement = (name = "", unit = "scoop") => {
    const item = emptyItem(name); item.servingUnit = unit;
    setAddOpen(false); beginEditor({ draft: { mealType: "snack", source: "supplement", consumedAt: consumedAtForDate(selectedDate),
      localDate: selectedDate, timezone: localTimezone(), items: [item] }, rememberAs: "supplement" });
  };

  const openBarcode = () => {
    setAddOpen(false); beginEditor({ draft: { mealType: "snack", source: "barcode", consumedAt: consumedAtForDate(selectedDate),
      localDate: selectedDate, timezone: localTimezone(), items: [emptyItem()] }, rememberAs: "packaged", barcode: "" });
  };

  const editEntry = (entry: NutritionEntry) => beginEditor({ draft: {
    ...entry,
    items: entry.items.map((item) => ({ ...item }))
  }});

  const updateItem = (index: number, changes: Partial<NutritionItemDraft>) => setEditor((current) => {
    if (!current) return null;
    const items = [...current.draft.items]; items[index] = { ...items[index], ...changes };
    return { ...current, draft: { ...current.draft, items } };
  });

  const changeQuantity = (index: number, raw: string) => {
    const value = parsed(raw, false) ?? 0;
    const current = editor?.draft.items[index]; if (!current) return;
    const key = current.id ?? `index:${index}`;
    if (!quantityBases.current.has(key) && current.servingQuantity > 0) quantityBases.current.set(key, { ...current });
    const basis = quantityBases.current.get(key) ?? current;
    const factor = basis.servingQuantity > 0 ? value / basis.servingQuantity : 0;
    updateItem(index, { ...scaleNutrients(basis, factor), servingQuantity: value });
  };

  const analyze = async (source: "camera" | "library") => {
    setAddOpen(false); setAnalyzing(true); setNotice(null);
    try {
      const image = await chooseAndCompressMealImage(source); if (!image) return;
      const result = await new SupabaseNutritionImageAnalyzer().analyze(image);
      const items = result.candidates.map((candidate) => candidate.catalogueMatch ? {
        ...candidate.catalogueMatch, confidence: candidate.confidence
      } : {
        ...emptyItem(candidate.names[0] || "Unidentified food"), servingGrams: candidate.estimatedGrams,
        servingAssumption: candidate.portionDescription, confidence: candidate.confidence,
        nutrientSource: "unresolved_requires_confirmation"
      });
      beginEditor({ draft: {
        mealType: "snack", source: "photo", consumedAt: consumedAtForDate(selectedDate), localDate: selectedDate,
        timezone: localTimezone(), imageReference: image.uri, imageMime: image.mimeType,
        analyzerProvider: result.provider, analyzerModel: result.model, analyzerRequestId: result.requestId,
        confidence: result.confidence, items
      }});
      if (result.confidence < 0.55) setNotice("Low-confidence photo result. Check every item and serving before saving.");
    } catch (error) {
      setNotice(`${error instanceof Error ? error.message : "Photo analysis failed"} You can still add food manually.`);
    } finally { setAnalyzing(false); }
  };

  const saveEditor = async () => {
    if (!editor) return;
    if (editor.draft.items.some((item) => !item.name.trim() || item.servingQuantity <= 0)) {
      setNotice("Each food needs a name and serving quantity greater than zero."); return;
    }
    setSaving(true);
    try {
      await saveNutritionEntry(editor.draft);
      if (editor.rememberAs && editor.draft.items[0]) {
        const item = editor.draft.items[0];
        await saveCustomNutritionFood({
          ...item, name: item.name, category: editor.rememberAs, barcode: editor.barcode?.trim() || undefined,
          servingGrams: item.servingGrams ?? null, nutrientSource: item.nutrientSource,
          nutrientSourceRef: item.nutrientSourceRef ?? "user_entered",
          servingAssumption: item.servingAssumption ?? "User-confirmed serving"
        });
      }
      setEditor(null); setNotice(null); await refresh();
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not save food."); }
    finally { setSaving(false); }
  };

  const beginGoals = () => {
    setGoalFields({ calories: numberText(goals.calorieGoal), protein: numberText(goals.proteinGoalGrams),
      carbs: numberText(goals.carbohydrateGoalGrams), fat: numberText(goals.fatGoalGrams), fibre: numberText(goals.fibreGoalGrams) });
    setGoalsOpen(true);
  };

  return (
    <ScreenShell header={{ title: "Nutrition", eyebrow: "OFFLINE FIRST", subtitle: displayDate, onBack,
      action: <Button label="Goals" icon={Settings2} variant="ghost" size="small" onPress={beginGoals} /> }}>
      {notice ? <StatusBanner title={notice} variant="warning" style={{ marginBottom: theme.spacing.md }} /> : null}
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: theme.spacing.sm,
          marginBottom: theme.spacing.md
        }}
      >
        <Button
          label="Previous"
          icon={ChevronLeft}
          variant="ghost"
          size="small"
          onPress={() => setSelectedDate(shiftDay(selectedDate, -1))}
          style={{ flexGrow: 1, flexBasis: 104, minWidth: 0 }}
        />
        <Button
          label="Today"
          variant="outline"
          size="small"
          onPress={() => setSelectedDate(dateKey(new Date()))}
          style={{ flexGrow: 1, flexBasis: 88, minWidth: 0 }}
        />
        <Button
          label="Next"
          icon={ChevronRight}
          iconPosition="end"
          variant="ghost"
          size="small"
          onPress={() => setSelectedDate(shiftDay(selectedDate, 1))}
          style={{ flexGrow: 1, flexBasis: 104, minWidth: 0 }}
        />
      </View>

      <Card variant="brand" padding="large">
        <Text style={[theme.typography.label, { color: theme.colors.brand }]}>DAILY CALORIES · ESTIMATED</Text>
        <Text
          numberOfLines={2}
          adjustsFontSizeToFit
          minimumFontScale={0.78}
          maxFontSizeMultiplier={1.25}
          style={[theme.typography.headline, { color: theme.colors.textPrimary, marginTop: theme.spacing.sm }]}
        >
          {Math.round(safeNutrient(totals.calories))} <Text style={theme.typography.body}>/ {Math.round(goals.calorieGoal)} kcal</Text>
        </Text>
        <ProgressBar value={progress.calories * 100} max={100} style={{ marginTop: theme.spacing.lg }} />
        <Text style={[theme.typography.caption, { color: theme.colors.textSecondary, marginTop: theme.spacing.sm }]}>
          Food photos are estimates. Confirm portions, oil, sugar, and hidden ingredients before saving.
        </Text>
      </Card>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.md, marginTop: theme.spacing.lg }}>
        <Macro label="Protein" value={totals.proteinGrams} goal={goals.proteinGoalGrams} />
        <Macro label="Carbs" value={totals.carbohydrateGrams} goal={goals.carbohydrateGoalGrams} />
        <Macro label="Fat" value={totals.fatGrams} goal={goals.fatGoalGrams} />
        {goals.fibreGoalGrams ? <Macro label="Fibre" value={totals.fibreGrams} goal={goals.fibreGoalGrams} /> : null}
      </View>

      <Button label={analyzing ? "Analyzing…" : "Add food"} icon={Plus} fullWidth loading={analyzing} onPress={() => setAddOpen(true)} style={{ marginTop: theme.spacing.xl }} />

      {MEALS.map((meal) => (
        <View key={meal.key} style={{ marginTop: theme.spacing["2xl"] }}>
          <SectionHeader title={meal.label} style={{ marginBottom: theme.spacing.sm }} />
          {grouped[meal.key].length === 0 ? (
            <InteractiveCard onPress={() => { openManual(); setEditor((state) => state ? { ...state, draft: { ...state.draft, mealType: meal.key } } : null); }} cardProps={{ variant: "subtle", padding: "small" }}>
              <Text style={[theme.typography.body, { color: theme.colors.textSecondary }]}>No food logged · tap to add</Text>
            </InteractiveCard>
          ) : grouped[meal.key].map((entry) => {
            const entryTotals = dailyTotals([entry]);
            return <InteractiveCard key={entry.id} onPress={() => editEntry(entry)} accessibilityRole="button" cardProps={{ padding: "small", style: { marginBottom: theme.spacing.sm } }}>
                <View style={{ flexDirection: "row", gap: theme.spacing.md, alignItems: "center" }}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[theme.typography.bodyStrong, { color: theme.colors.textPrimary }]} numberOfLines={2}>{entry.items.map((item) => item.name).join(", ")}</Text>
                    <Text style={[theme.typography.caption, { color: theme.colors.textSecondary, marginTop: theme.spacing.xs }]} numberOfLines={2}> 
                      {entry.source} · {entry.confidence == null ? "confirmed by you" : `${Math.round(entry.confidence * 100)}% image confidence`}
                    </Text>
                  </View>
                  <Text style={[theme.typography.labelLarge, { color: theme.colors.textPrimary, flexShrink: 0 }]} numberOfLines={1}>
                    {Math.round(safeNutrient(entryTotals.calories))} kcal
                  </Text>
                </View>
            </InteractiveCard>;
          })}
        </View>
      ))}

      <Card padding="large" style={{ marginTop: theme.spacing["2xl"] }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.sm }}><History color={theme.colors.brand} size={18} /><Text style={[theme.typography.titleSmall, { color: theme.colors.textPrimary }]}>This week</Text></View>
        <Text style={[theme.typography.body, { color: theme.colors.textSecondary, marginTop: theme.spacing.sm }]}>
          {Math.round(safeNutrient(weekTotals.calories))} kcal across {daysLogged} {daysLogged === 1 ? "day" : "days"}
          {daysLogged ? ` · ${Math.round(safeNutrient(weekTotals.calories) / daysLogged)} kcal/day average` : ""}
        </Text>
      </Card>

      <SheetDialog visible={addOpen} title="Add food" subtitle="Manual logging always works offline." onClose={() => setAddOpen(false)}>
        <View style={{ gap: theme.spacing.sm }}>
          <Button label="Take a meal photo" icon={Camera} fullWidth onPress={() => analyze("camera")} />
          <Button label="Choose from gallery" icon={ImageIcon} variant="outline" fullWidth onPress={() => analyze("library")} />
          <Button label="Add supplement" icon={Sparkles} variant="secondary" fullWidth onPress={() => openSupplement()} />
          <Button label="Barcode / packaged food" variant="outline" fullWidth onPress={openBarcode} />
          <Button label="Manual / quick add" icon={Plus} variant="outline" fullWidth onPress={() => openManual()} />
          <TextField label="Search recent foods" value={quickSearch} onChangeText={setQuickSearch} placeholder="Rice, dal, protein…" containerStyle={{ marginTop: theme.spacing.sm }} />
          {recent.length ? <Text style={[theme.typography.label, { color: theme.colors.textSecondary, marginTop: theme.spacing.md }]}>RECENTLY USED</Text> : null}
          {recent.filter((food) => !quickSearch.trim() || food.name.toLowerCase().includes(quickSearch.trim().toLowerCase())).slice(0, 6).map((food) => <Button key={food.id} label={`${food.name} · ${Math.round(safeNutrient(food.calories))} kcal`} variant="ghost" fullWidth onPress={() => openManual("quick-add", fromCatalogue(food))} />)}
          <Text style={[theme.typography.label, { color: theme.colors.textSecondary, marginTop: theme.spacing.md }]}>SUPPLEMENT TEMPLATES · VALUES REQUIRED FROM LABEL</Text>
          {SUPPLEMENT_TEMPLATES.filter((item) => !quickSearch.trim() || item.name.toLowerCase().includes(quickSearch.trim().toLowerCase())).map((item) => <Button key={item.name} label={item.name} variant="ghost" fullWidth onPress={() => openSupplement(item.name, item.unit)} />)}
        </View>
      </SheetDialog>

      <SheetDialog visible={Boolean(editor)} title={editor?.draft.id ? "Edit nutrition entry" : "Confirm before saving"}
        subtitle={editor?.draft.source === "photo" ? "Image estimates are not exact. Check every food and serving." : "Enter values from a reliable label or nutrition source."}
        onClose={() => setEditor(null)} error={null}
        primaryAction={{ label: "Confirm and save", onPress: saveEditor, loading: saving }}
        secondaryAction={{ label: "Add item", onPress: () => setEditor((state) => state ? { ...state, draft: { ...state.draft, items: [...state.draft.items, emptyItem()] } } : null) }}
        destructiveAction={editor?.draft.id ? { label: "Delete entry", icon: Trash2, onPress: () => Alert.alert("Delete this entry?", "It will be removed locally and from your private cloud data after sync.", [
          { text: "Cancel", style: "cancel" }, { text: "Delete", style: "destructive", onPress: () => { const entryId = editor.draft.id; if (!entryId) return; deleteNutritionEntry(entryId).then(() => { setEditor(null); refresh().catch(() => undefined); }); } }
        ]) } : undefined}>
        {editor ? <>
          <Text style={[theme.typography.label, { color: theme.colors.textSecondary }]}>MEAL</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm, marginTop: theme.spacing.sm, marginBottom: theme.spacing.lg }}>
            {MEALS.map((meal) => <Button key={meal.key} label={meal.label} size="small" variant={editor.draft.mealType === meal.key ? "secondary" : "outline"} onPress={() => setEditor((state) => state ? { ...state, draft: { ...state.draft, mealType: meal.key } } : null)} />)}
          </View>
          {editor.draft.confidence != null ? <StatusBanner variant={editor.draft.confidence < 0.55 ? "warning" : "info"} title={`${Math.round(editor.draft.confidence * 100)}% estimation confidence`} style={{ marginBottom: theme.spacing.md }} /> : null}
          {editor.rememberAs === "packaged" ? <TextField label="Barcode (optional)" keyboardType="number-pad" value={editor.barcode ?? ""} onChangeText={(barcode) => setEditor((state) => state ? { ...state, barcode } : null)} containerStyle={{ marginBottom: theme.spacing.md }} /> : null}
          {editor.draft.items.map((item, index) => <Card key={item.id ?? index} padding="small" style={{ marginBottom: theme.spacing.md }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={[theme.typography.label, { color: theme.colors.brand }]}>FOOD {index + 1}</Text>
              {editor.draft.items.length > 1 ? <Button label="Remove" variant="ghost" size="small" onPress={() => setEditor((state) => state ? { ...state, draft: { ...state.draft, items: state.draft.items.filter((_, itemIndex) => itemIndex !== index) } } : null)} /> : null}
            </View>
            <TextField label="Food name" value={item.name} onChangeText={(name) => updateItem(index, { name })} containerStyle={{ marginTop: theme.spacing.sm }} />
            <ResponsiveFieldRow style={{ marginTop: theme.spacing.sm }}>
              <TextField label="Quantity" keyboardType="decimal-pad" value={numberText(item.servingQuantity)} onChangeText={(value) => changeQuantity(index, value)} containerStyle={{ flex: 1 }} />
              <TextField label="Unit" value={item.servingUnit} onChangeText={(servingUnit) => updateItem(index, { servingUnit })} placeholder="g, scoop, roti" containerStyle={{ flex: 1 }} />
            </ResponsiveFieldRow>
            <ResponsiveFieldRow style={{ marginTop: theme.spacing.sm }}>
              <TextField label="Calories" keyboardType="decimal-pad" value={numberText(item.calories)} onChangeText={(v) => updateItem(index, { calories: parsed(v) })} containerStyle={{ flex: 1 }} />
              <TextField label="Protein g" keyboardType="decimal-pad" value={numberText(item.proteinGrams)} onChangeText={(v) => updateItem(index, { proteinGrams: parsed(v) })} containerStyle={{ flex: 1 }} />
            </ResponsiveFieldRow>
            <ResponsiveFieldRow style={{ marginTop: theme.spacing.sm }}>
              <TextField label="Carbs g" keyboardType="decimal-pad" value={numberText(item.carbohydrateGrams)} onChangeText={(v) => updateItem(index, { carbohydrateGrams: parsed(v) })} containerStyle={{ flex: 1 }} />
              <TextField label="Fat g" keyboardType="decimal-pad" value={numberText(item.fatGrams)} onChangeText={(v) => updateItem(index, { fatGrams: parsed(v) })} containerStyle={{ flex: 1 }} />
            </ResponsiveFieldRow>
            <ResponsiveFieldRow style={{ marginTop: theme.spacing.sm }}>
              <TextField label="Fibre g" keyboardType="decimal-pad" value={numberText(item.fibreGrams)} onChangeText={(v) => updateItem(index, { fibreGrams: parsed(v) })} containerStyle={{ flex: 1 }} />
              <TextField label="Sugar g" keyboardType="decimal-pad" value={numberText(item.sugarGrams)} onChangeText={(v) => updateItem(index, { sugarGrams: parsed(v) })} containerStyle={{ flex: 1 }} />
            </ResponsiveFieldRow>
            <TextField label="Sodium mg" keyboardType="decimal-pad" value={numberText(item.sodiumMilligrams)} onChangeText={(v) => updateItem(index, { sodiumMilligrams: parsed(v) })} containerStyle={{ marginTop: theme.spacing.sm }} />
            <Text style={[theme.typography.caption, { color: theme.colors.textSecondary, marginTop: theme.spacing.sm }]}>Source: {item.nutrientSource}{item.servingAssumption ? ` · ${item.servingAssumption}` : ""}{item.confidence == null ? "" : ` · ${Math.round(item.confidence * 100)}% confidence`}</Text>
          </Card>)}
          {editor.rememberAs ? <Text style={[theme.typography.bodyStrong, { color: theme.colors.brand }]}>✓ Remember as a custom {editor.rememberAs}</Text> : null}
        </> : null}
      </SheetDialog>

      <SheetDialog visible={goalsOpen} title="Nutrition goals" subtitle="Goals stay on this device and sync privately when signed in." onClose={() => setGoalsOpen(false)}
        primaryAction={{ label: "Save goals", onPress: async () => {
          const calories = parsed(goalFields.calories, false); const protein = parsed(goalFields.protein, false);
          const carbs = parsed(goalFields.carbs, false); const fat = parsed(goalFields.fat, false);
          if (!calories || protein == null || carbs == null || fat == null) { setNotice("Enter valid calorie and macro goals."); return; }
          await saveNutritionGoals({ calorieGoal: calories, proteinGoalGrams: protein, carbohydrateGoalGrams: carbs, fatGoalGrams: fat, fibreGoalGrams: parsed(goalFields.fibre) });
          setGoalsOpen(false); await refresh();
        } }}>
        <TextField label="Daily calories" keyboardType="decimal-pad" value={goalFields.calories} onChangeText={(calories) => setGoalFields((state) => ({ ...state, calories }))} />
        <TextField label="Protein (g)" keyboardType="decimal-pad" value={goalFields.protein} onChangeText={(protein) => setGoalFields((state) => ({ ...state, protein }))} containerStyle={{ marginTop: theme.spacing.md }} />
        <TextField label="Carbohydrates (g)" keyboardType="decimal-pad" value={goalFields.carbs} onChangeText={(carbs) => setGoalFields((state) => ({ ...state, carbs }))} containerStyle={{ marginTop: theme.spacing.md }} />
        <TextField label="Fat (g)" keyboardType="decimal-pad" value={goalFields.fat} onChangeText={(fat) => setGoalFields((state) => ({ ...state, fat }))} containerStyle={{ marginTop: theme.spacing.md }} />
        <TextField label="Fibre (g), optional" keyboardType="decimal-pad" value={goalFields.fibre} onChangeText={(fibre) => setGoalFields((state) => ({ ...state, fibre }))} containerStyle={{ marginTop: theme.spacing.md }} />
      </SheetDialog>

      {loading ? <SkeletonCard rows={2} style={{ marginTop: theme.spacing.md }} /> : null}
    </ScreenShell>
  );
}
