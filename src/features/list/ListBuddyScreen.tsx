import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  BackHandler,
  Platform,
  ScrollView,
  Text,
  View
} from "react-native";
import { Check, ListTodo, Pencil, Plus, Search, Trash2, X } from "lucide-react-native";

import { ScreenLayout, useScreenBackgrounds } from "../../components/layout";
import { useAnthraTheme } from "../../design-system";
import { MAX_LIST_ITEM_LENGTH, MAX_LIST_NAME_LENGTH } from "../../constants/listBuddy";
import {
  clearCompletedListItems,
  deleteListCategory,
  deleteListItem,
  getListCategories,
  getListItems,
  saveListCategory,
  saveListItem,
  setListItemCompleted
} from "../../db";
import type { ListBuddyCategory, ListBuddyItem } from "../../types";
import {
  AnimatedPressable,
  Button,
  Card,
  CardActionFooter,
  EmptyState,
  InteractiveCard,
  FormDialog,
  IconButton,
  ProgressBar,
  ScreenHeader,
  SectionHeader,
  SkeletonCard,
  StatusBanner,
  TextField
} from "../../components/ui";

type ListBuddyScreenProps = {
  onBack: () => void;
};

export function ListBuddyScreen({ onBack }: ListBuddyScreenProps) {
  const anthraTheme = useAnthraTheme();
  const backgrounds = useScreenBackgrounds();
  const { colors, layout, radii, spacing, typography } = anthraTheme;
  const [categories, setCategories] = useState<ListBuddyCategory[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [items, setItems] = useState<ListBuddyItem[]>([]);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [categoryNameText, setCategoryNameText] = useState("");
  const [itemText, setItemText] = useState("");
  const [listSearchText, setListSearchText] = useState("");
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(null);
  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [quickItemText, setQuickItemText] = useState("");
  const [recentlyClearedItems, setRecentlyClearedItems] = useState<ListBuddyItem[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [itemError, setItemError] = useState<string | null>(null);
  const [savingCategory, setSavingCategory] = useState(false);
  const [savingItem, setSavingItem] = useState(false);
  const [quickAdding, setQuickAdding] = useState(false);
  const categorySaveInFlight = useRef(false);
  const itemSaveInFlight = useRef(false);
  const quickAddInFlight = useRef(false);

  const selectedCategory = useMemo(
    () => categories.find((category) => category.id === selectedCategoryId) ?? null,
    [categories, selectedCategoryId]
  );

  const editingCategory = useMemo(
    () => categories.find((category) => category.id === editingCategoryId) ?? null,
    [categories, editingCategoryId]
  );

  const filteredCategories = useMemo(() => {
    const query = listSearchText.trim().toLocaleLowerCase();
    if (!query) return categories;
    return categories.filter((category) => category.name.toLocaleLowerCase().includes(query));
  }, [categories, listSearchText]);

  const refreshCategories = useCallback(async () => {
    const next = await getListCategories();
    setCategories(next);
    setLoadError(null);
  }, []);

  const refreshItems = useCallback(async (categoryId: number) => {
    const next = await getListItems(categoryId);
    setItems(next);
    setLoadError(null);
  }, []);

  useEffect(() => {
    refreshCategories().catch((error) => {
      setLoadError(error instanceof Error ? error.message : "Could not load your lists.");
    }).finally(() => setInitialLoading(false));
  }, [refreshCategories]);

  useEffect(() => {
    if (!selectedCategoryId) {
      setItems([]);
      return;
    }
    refreshItems(selectedCategoryId).catch((error) => {
      setLoadError(error instanceof Error ? error.message : "Could not load this list.");
    });
  }, [refreshItems, selectedCategoryId]);

  const openCategoryModal = (category?: ListBuddyCategory) => {
    setCategoryError(null);
    if (category) {
      setEditingCategoryId(category.id);
      setCategoryNameText(category.name);
    } else {
      setEditingCategoryId(null);
      setCategoryNameText("");
    }
    setCategoryModalOpen(true);
  };

  const openItemModal = (item?: ListBuddyItem) => {
    if (!selectedCategoryId) return;
    setItemError(null);
    if (item) {
      setEditingItemId(item.id);
      setItemText(item.text);
    } else {
      setEditingItemId(null);
      setItemText("");
    }
    setItemModalOpen(true);
  };

  const handleSaveCategory = async () => {
    if (categorySaveInFlight.current) return;
    categorySaveInFlight.current = true;
    setSavingCategory(true);
    setCategoryError(null);
    try {
      const categoryId = await saveListCategory({
        id: editingCategoryId ?? undefined,
        name: categoryNameText
      });
      await refreshCategories();
      if (!selectedCategoryId) {
        setSelectedCategoryId(categoryId);
      }
      setCategoryModalOpen(false);
      setCategoryNameText("");
      setEditingCategoryId(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save category.";
      setCategoryError(message);
    } finally {
      categorySaveInFlight.current = false;
      setSavingCategory(false);
    }
  };

  const handleDeleteCategory = (
    category: ListBuddyCategory,
    onDeleted?: () => void
  ) => {
    Alert.alert("Delete category", `Delete "${category.name}" and all items?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteListCategory(category.id);
            if (selectedCategoryId === category.id) {
              setSelectedCategoryId(null);
              setItems([]);
            }
            await refreshCategories();
            onDeleted?.();
          } catch (error) {
            const message = error instanceof Error ? error.message : "Could not delete category.";
            Alert.alert("Delete failed", message);
          }
        }
      }
    ]);
  };

  const handleSaveItem = async () => {
    if (!selectedCategoryId || itemSaveInFlight.current) return;
    itemSaveInFlight.current = true;
    setSavingItem(true);
    setItemError(null);
    const existingItem = items.find((item) => item.id === editingItemId) ?? null;
    try {
      await saveListItem({
        id: editingItemId ?? undefined,
        categoryId: selectedCategoryId,
        text: itemText,
        completed: existingItem?.completed ?? false
      });
      await Promise.all([refreshItems(selectedCategoryId), refreshCategories()]);
      setItemModalOpen(false);
      setItemText("");
      setEditingItemId(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save list item.";
      setItemError(message);
    } finally {
      itemSaveInFlight.current = false;
      setSavingItem(false);
    }
  };

  const handleDeleteItem = (item: ListBuddyItem) => {
    Alert.alert("Delete item", `Delete "${item.text}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          if (!selectedCategoryId) return;
          try {
            await deleteListItem(item.id);
            await Promise.all([refreshItems(selectedCategoryId), refreshCategories()]);
          } catch (error) {
            const message = error instanceof Error ? error.message : "Could not delete item.";
            Alert.alert("Delete failed", message);
          }
        }
      }
    ]);
  };

  const handleToggleItem = async (item: ListBuddyItem) => {
    if (!selectedCategoryId) return;
    try {
      await setListItemCompleted(item.id, !item.completed);
      await Promise.all([refreshItems(selectedCategoryId), refreshCategories()]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not update item.";
      Alert.alert("Update failed", message);
    }
  };

  const handleQuickAddItem = async () => {
    if (!selectedCategoryId || !quickItemText.trim() || quickAddInFlight.current) return;
    quickAddInFlight.current = true;
    setQuickAdding(true);
    const categoryId = selectedCategoryId;
    const text = quickItemText;
    try {
      await saveListItem({ categoryId, text, completed: false });
      setQuickItemText("");
      await Promise.all([refreshItems(categoryId), refreshCategories()]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not add item.";
      setLoadError(message);
    } finally {
      quickAddInFlight.current = false;
      setQuickAdding(false);
    }
  };

  const handleClearCompleted = () => {
    if (!selectedCategoryId) return;
    const completedItems = items.filter((item) => item.completed);
    if (completedItems.length === 0) return;

    Alert.alert(
      "Clear completed items?",
      `Remove ${completedItems.length} completed ${completedItems.length === 1 ? "item" : "items"}? You can undo this while this list is open.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: async () => {
            await clearCompletedListItems(selectedCategoryId);
            setRecentlyClearedItems(completedItems);
            await Promise.all([refreshItems(selectedCategoryId), refreshCategories()]);
          }
        }
      ]
    );
  };

  const handleUndoClear = async () => {
    if (!selectedCategoryId || recentlyClearedItems.length === 0) return;
    try {
      await Promise.all(
        recentlyClearedItems.map((item) =>
          saveListItem({ categoryId: selectedCategoryId, text: item.text, completed: true })
        )
      );
      setRecentlyClearedItems([]);
      await Promise.all([refreshItems(selectedCategoryId), refreshCategories()]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not restore items.";
      Alert.alert("Undo failed", message);
    }
  };

  const handleRetryLoad = async () => {
    try {
      if (selectedCategoryId) {
        await Promise.all([refreshItems(selectedCategoryId), refreshCategories()]);
      } else {
        await refreshCategories();
      }
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Could not load your lists.");
    }
  };

  const closeSelectedCategory = useCallback(() => {
    setSelectedCategoryId(null);
    setRecentlyClearedItems([]);
    setQuickItemText("");
    setLoadError(null);
  }, []);

  useEffect(() => {
    if (Platform.OS !== "android") return undefined;

    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (!selectedCategory) return false;
      closeSelectedCategory();
      return true;
    });

    return () => subscription.remove();
  }, [closeSelectedCategory, selectedCategory]);

  const renderCategoryCard = (category: ListBuddyCategory) => {
    const percent = category.totalItems > 0
      ? Math.round((category.completedItems / category.totalItems) * 100)
      : 0;

    return (
      <InteractiveCard
        key={category.id}
        onPress={() => {
          setSelectedCategoryId(category.id);
          setRecentlyClearedItems([]);
          setQuickItemText("");
          setLoadError(null);
        }}
        accessibilityRole="button"
        accessibilityLabel={`${category.name}, ${category.completedItems} of ${category.totalItems} completed`}
        accessibilityHint="Opens this list"
        style={{ marginBottom: spacing.md }}
        cardProps={{ padding: "none", style: { borderColor: colors.brandBorder } }}
      >
          <View style={{ minHeight: 132, padding: spacing.lg }}>
            <View className="flex-row items-start justify-between" style={{ gap: spacing.md }}>
              <View className="min-w-0 flex-1">
                <Text numberOfLines={2} style={[typography.titleSmall, { color: colors.textPrimary }]}>
                  {category.name}
                </Text>
                <Text style={[typography.caption, { color: colors.textSecondary, marginTop: spacing.xs }]}>
                  {category.totalItems === 0
                    ? "Ready for your first item"
                    : `${category.completedItems} of ${category.totalItems} complete`}
                </Text>
              </View>
              <View
                accessible
                accessibilityLabel={`${percent} percent complete`}
                style={{
                  minWidth: 54,
                  paddingHorizontal: spacing.sm,
                  paddingVertical: spacing.xs,
                  borderRadius: radii.full,
                  backgroundColor: percent === 100 && category.totalItems > 0 ? colors.successSoft : colors.brandSoft
                }}
              >
                <Text
                  style={[
                    typography.label,
                    { textAlign: "center", color: percent === 100 && category.totalItems > 0 ? colors.success : colors.brand }
                  ]}
                >
                  {percent}%
                </Text>
              </View>
            </View>

            <ProgressBar
              value={category.completedItems}
              max={category.totalItems}
              height={6}
              accessibilityLabel={`${category.name} progress`}
              accessibilityValueText={`${category.completedItems} of ${category.totalItems} complete`}
              style={{ marginTop: spacing.md }}
            />

            {category.previewItems.length > 0 && (
              <View style={{ gap: spacing.xs, marginTop: spacing.md }}>
                {category.previewItems.slice(0, 2).map((item) => (
                  <Text
                    key={item.id}
                    numberOfLines={1}
                    style={[
                      typography.caption,
                      {
                        color: item.completed ? colors.textTertiary : colors.textSecondary,
                        textDecorationLine: item.completed ? "line-through" : "none"
                      }
                    ]}
                  >
                    {item.completed ? "Done" : "Next"} · {item.text}
                  </Text>
                ))}
              </View>
            )}
          </View>
      </InteractiveCard>
    );
  };

  const selectedPercent = selectedCategory && selectedCategory.totalItems > 0
    ? Math.round((selectedCategory.completedItems / selectedCategory.totalItems) * 100)
    : 0;

  return (
    <ScreenLayout {...backgrounds.canvas} safeAreaEdges={["top", "bottom"]}>
      <View
        style={{
          paddingHorizontal: layout.screenPadding,
          borderBottomWidth: 1,
          borderBottomColor: colors.divider,
          backgroundColor: colors.canvas
        }}
      >
        <ScreenHeader
          eyebrow="ORGANIZE"
          title={selectedCategory?.name ?? "Lists"}
          subtitle={selectedCategory ? `${selectedCategory.totalItems} items` : "Keep small plans clear and actionable"}
          onBack={selectedCategory ? closeSelectedCategory : onBack}
          backLabel={selectedCategory ? "Back to all lists" : "Back to Anthra hub"}
          style={{ width: "100%", maxWidth: layout.contentMaxWidth, alignSelf: "center" }}
          action={
            <IconButton
              icon={Plus}
              accessibilityLabel={selectedCategory ? `Add item to ${selectedCategory.name}` : "Create a new list"}
              variant="primary"
              onPress={() => selectedCategory ? openItemModal() : openCategoryModal()}
            />
          }
        />
      </View>

      <ScrollView
        className="flex-1"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          width: "100%",
          maxWidth: layout.contentMaxWidth,
          alignSelf: "center",
          padding: layout.screenPadding,
          paddingBottom: spacing["4xl"]
        }}
      >
        {initialLoading ? <SkeletonCard rows={3} /> : null}
        {loadError && (
          <View style={{ marginBottom: spacing.lg }}>
            <StatusBanner title="Lists need attention" message={loadError} variant="danger" />
            <Button
              label="Try again"
              variant="outline"
              size="small"
              onPress={() => handleRetryLoad().catch(() => undefined)}
              style={{ marginTop: spacing.sm }}
            />
          </View>
        )}

        {!selectedCategory && (
          <>
            <Card variant="brand" style={{ marginBottom: spacing.xl }}>
              <View className="flex-row items-start" style={{ gap: spacing.md }}>
                <View
                  className="items-center justify-center"
                  style={{ width: 44, height: 44, borderRadius: radii.md, backgroundColor: colors.surface }}
                >
                  <ListTodo accessible={false} size={23} color={colors.brand} />
                </View>
                <View className="min-w-0 flex-1">
                  <Text style={[typography.titleSmall, { color: colors.textPrimary }]}>Everything in its place</Text>
                  <Text style={[typography.body, { color: colors.textSecondary, marginTop: spacing.xs }]}>
                    Capture an item, tap it when complete, and keep each list focused.
                  </Text>
                </View>
              </View>
            </Card>

            {initialLoading ? null : categories.length === 0 ? (
              <EmptyState
                icon={ListTodo}
                title="Create your first list"
                description="Groceries, movies, errands—start with anything you want out of your head."
                action={{ label: "New list", icon: Plus, onPress: () => openCategoryModal() }}
              />
            ) : (
              <View>
                <SectionHeader
                  title="Your lists"
                  meta={
                    listSearchText.trim()
                      ? `${filteredCategories.length} of ${categories.length}`
                      : `${categories.length} ${categories.length === 1 ? "list" : "lists"}`
                  }
                  style={{ marginBottom: spacing.md }}
                />
                <TextField
                  label="Search lists"
                  value={listSearchText}
                  onChangeText={setListSearchText}
                  placeholder="Search by list name"
                  leadingIcon={Search}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="search"
                  accessibilityLabel="Search lists by name"
                  containerStyle={{ marginBottom: spacing.lg }}
                  trailing={listSearchText.length > 0 ? (
                    <IconButton
                      icon={X}
                      size="small"
                      variant="ghost"
                      accessibilityLabel="Clear list search"
                      onPress={() => setListSearchText("")}
                    />
                  ) : undefined}
                />
                {filteredCategories.length > 0 ? (
                  filteredCategories.map(renderCategoryCard)
                ) : (
                  <EmptyState
                    icon={Search}
                    title="No lists found"
                    description="Try a different list name."
                    action={{ label: "Clear search", onPress: () => setListSearchText("") }}
                  />
                )}
              </View>
            )}
          </>
        )}

        {selectedCategory && (
          <>
            <View className="flex-row items-end" style={{ gap: spacing.md, marginBottom: spacing.lg }}>
              <TextField
                label="Quick add"
                value={quickItemText}
                onChangeText={(value) => {
                  setQuickItemText(value);
                  if (loadError) setLoadError(null);
                }}
                onSubmitEditing={() => handleQuickAddItem().catch(() => undefined)}
                returnKeyType="done"
                placeholder="Add an item"
                maxLength={MAX_LIST_ITEM_LENGTH}
                accessibilityLabel={`New item for ${selectedCategory.name}`}
                containerStyle={{ flex: 1, minWidth: 0 }}
                disabled={quickAdding}
              />
              <IconButton
                icon={Plus}
                accessibilityLabel="Add list item"
                variant="primary"
                size="large"
                disabled={quickAdding || !quickItemText.trim()}
                onPress={() => handleQuickAddItem().catch(() => undefined)}
                style={{ flexShrink: 0 }}
              />
            </View>

            <Card style={{ marginBottom: spacing.lg }}>
              <View className="flex-row items-center justify-between" style={{ gap: spacing.md }}>
                <View className="min-w-0 flex-1">
                  <Text style={[typography.label, { color: colors.textSecondary }]}>PROGRESS</Text>
                  <Text style={[typography.titleMedium, { color: colors.textPrimary, marginTop: spacing.xs }]}>
                    {selectedCategory.completedItems} of {selectedCategory.totalItems} complete
                  </Text>
                </View>
                <View
                  accessible
                  accessibilityLabel={`${selectedPercent} percent complete`}
                  style={{
                    minWidth: 54,
                    paddingHorizontal: spacing.sm,
                    paddingVertical: spacing.xs,
                    borderRadius: radii.full,
                    backgroundColor:
                      selectedPercent === 100 && selectedCategory.totalItems > 0
                        ? colors.successSoft
                        : colors.brandSoft
                  }}
                >
                  <Text
                    style={[
                      typography.label,
                      {
                        textAlign: "center",
                        color:
                          selectedPercent === 100 && selectedCategory.totalItems > 0
                            ? colors.success
                            : colors.brand
                      }
                    ]}
                  >
                    {selectedPercent}%
                  </Text>
                </View>
                <IconButton
                  icon={Pencil}
                  size="small"
                  accessibilityLabel={`Edit ${selectedCategory.name}`}
                  onPress={() => openCategoryModal(selectedCategory)}
                />
              </View>
              <CardActionFooter
                insetTop="lg"
                gap="lg"
                progress={{
                  value: selectedCategory.completedItems,
                  max: selectedCategory.totalItems,
                  accessibilityLabel: `${selectedCategory.name} progress`,
                  accessibilityValueText: `${selectedCategory.completedItems} of ${selectedCategory.totalItems} complete`
                }}
                action={
                  selectedCategory.completedItems > 0
                    ? {
                        label: "Clear completed",
                        variant: "outline",
                        size: "small",
                        onPress: handleClearCompleted
                      }
                    : undefined
                }
              />
            </Card>

            {recentlyClearedItems.length > 0 && (
              <Card variant="brand" style={{ marginBottom: spacing.lg }}>
                <View className="flex-row items-center" style={{ gap: spacing.md }}>
                  <Text
                    numberOfLines={2}
                    maxFontSizeMultiplier={1.4}
                    style={[typography.body, { color: colors.textPrimary, flex: 1, minWidth: 0 }]}
                  >
                    {recentlyClearedItems.length} completed {recentlyClearedItems.length === 1 ? "item" : "items"} cleared
                  </Text>
                  <Button
                    label="Undo"
                    variant="ghost"
                    size="small"
                    onPress={() => handleUndoClear().catch(() => undefined)}
                    style={{ flexShrink: 0 }}
                  />
                </View>
              </Card>
            )}

            <Card treatment="grouped">
              {items.length === 0 ? (
                <EmptyState
                  variant="inline"
                  icon={ListTodo}
                  title="This list is ready"
                  description="Add the first item above or use the plus button."
                  style={{ margin: spacing.lg }}
                />
              ) : (
                items.map((item, index) => (
                  <View
                    key={item.id}
                    className="flex-row items-center"
                    style={{
                      minHeight: 68,
                      paddingLeft: spacing.lg,
                      paddingRight: spacing.sm,
                      borderBottomWidth: index === items.length - 1 ? 0 : 1,
                      borderBottomColor: colors.divider
                    }}
                  >
                    <AnimatedPressable
                      onPress={() => handleToggleItem(item)}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: item.completed }}
                      accessibilityLabel={item.text}
                      accessibilityHint={item.completed ? "Marks this item incomplete" : "Marks this item complete"}
                      className="min-w-0 flex-1 flex-row items-center self-stretch"
                      style={({ pressed }) => ({
                        paddingVertical: spacing.md,
                        paddingRight: spacing.md,
                        opacity: pressed ? 0.72 : 1
                      })}
                    >
                      <View
                        className="items-center justify-center"
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: radii.full,
                          borderWidth: 2,
                          borderColor: item.completed ? colors.brand : colors.borderStrong,
                          backgroundColor: item.completed ? colors.brand : "transparent",
                          marginRight: spacing.lg,
                          flexShrink: 0
                        }}
                      >
                        {item.completed && <Check accessible={false} size={15} strokeWidth={3} color={colors.textOnBrandSolid} />}
                      </View>
                      <Text
                        numberOfLines={3}
                        maxFontSizeMultiplier={1.4}
                        style={[
                          typography.bodyLarge,
                          {
                            flex: 1,
                            minWidth: 0,
                            color: item.completed ? colors.textTertiary : colors.textPrimary,
                            textDecorationLine: item.completed ? "line-through" : "none"
                          }
                        ]}
                      >
                        {item.text}
                      </Text>
                    </AnimatedPressable>

                    <View className="flex-row" style={{ gap: spacing.xs, flexShrink: 0 }}>
                      <IconButton
                        icon={Pencil}
                        size="small"
                        variant="ghost"
                        accessibilityLabel={`Edit ${item.text}`}
                        onPress={() => openItemModal(item)}
                      />
                      <IconButton
                        icon={Trash2}
                        size="small"
                        variant="ghost"
                        color={colors.danger}
                        accessibilityLabel={`Delete ${item.text}`}
                        onPress={() => handleDeleteItem(item)}
                      />
                    </View>
                  </View>
                ))
              )}
            </Card>
          </>
        )}
      </ScrollView>

      <FormDialog
        visible={categoryModalOpen}
        title={editingCategoryId ? "Edit list" : "New list"}
        subtitle="Give it a short name that will be easy to scan later."
        onClose={() => {
          if (!savingCategory) setCategoryModalOpen(false);
        }}
        primaryAction={{
          label: "Save list",
          onPress: () => {
            handleSaveCategory().catch(() => undefined);
          },
          loading: savingCategory,
          disabled: !categoryNameText.trim()
        }}
        secondaryAction={{
          label: "Cancel",
          onPress: () => setCategoryModalOpen(false),
          disabled: savingCategory
        }}
        destructiveAction={
          editingCategory
            ? {
                label: "Delete list",
                icon: Trash2,
                disabled: savingCategory,
                onPress: () =>
                  handleDeleteCategory(editingCategory, () => {
                    setCategoryModalOpen(false);
                    setCategoryNameText("");
                    setEditingCategoryId(null);
                  })
              }
            : undefined
        }
      >
        <TextField
          label="List name"
          value={categoryNameText}
          onChangeText={(value) => {
            setCategoryNameText(value);
            if (categoryError) setCategoryError(null);
          }}
          error={categoryError ?? undefined}
          helperText={`${categoryNameText.length}/${MAX_LIST_NAME_LENGTH} characters`}
          placeholder="Movies to watch"
          maxLength={MAX_LIST_NAME_LENGTH}
          autoFocus
          disabled={savingCategory}
          returnKeyType="done"
          onSubmitEditing={() => handleSaveCategory().catch(() => undefined)}
        />
      </FormDialog>

      <FormDialog
        visible={itemModalOpen}
        title={editingItemId ? "Edit item" : "New item"}
        subtitle={selectedCategory ? `Add one clear action to ${selectedCategory.name}.` : "Add one clear action."}
        onClose={() => {
          if (!savingItem) setItemModalOpen(false);
        }}
        primaryAction={{
          label: "Save item",
          onPress: () => {
            handleSaveItem().catch(() => undefined);
          },
          loading: savingItem,
          disabled: !itemText.trim()
        }}
        secondaryAction={{
          label: "Cancel",
          onPress: () => setItemModalOpen(false),
          disabled: savingItem
        }}
      >
        <TextField
          label="Item"
          value={itemText}
          onChangeText={(value) => {
            setItemText(value);
            if (itemError) setItemError(null);
          }}
          error={itemError ?? undefined}
          helperText={`${itemText.length}/${MAX_LIST_ITEM_LENGTH} characters`}
          placeholder="Watch Inception"
          maxLength={MAX_LIST_ITEM_LENGTH}
          autoFocus
          disabled={savingItem}
          returnKeyType="done"
          onSubmitEditing={() => handleSaveItem().catch(() => undefined)}
        />
      </FormDialog>
    </ScreenLayout>
  );
}
