import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaView } from "react-native-safe-area-context";
import { ArrowLeft, ListTodo, Pencil, Plus, Trash2 } from "lucide-react-native";

import {
  deleteListCategory,
  deleteListItem,
  getListCategories,
  getListItems,
  saveListCategory,
  saveListItem,
  setListItemCompleted
} from "../db";
import type { ListBuddyCategory, ListBuddyItem } from "../types";

type ListBuddyScreenProps = {
  onBack: () => void;
  isDarkMode?: boolean;
  theme?: {
    accent: string;
    accentSoft: string;
    accentBorder: string;
    onAccent: string;
  };
};

export function ListBuddyScreen({ onBack, isDarkMode = false, theme }: ListBuddyScreenProps) {
  const [categories, setCategories] = useState<ListBuddyCategory[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [items, setItems] = useState<ListBuddyItem[]>([]);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [categoryNameText, setCategoryNameText] = useState("");
  const [itemText, setItemText] = useState("");
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(null);
  const [editingItemId, setEditingItemId] = useState<number | null>(null);

  const selectedCategory = useMemo(
    () => categories.find((category) => category.id === selectedCategoryId) ?? null,
    [categories, selectedCategoryId]
  );

  const editingCategory = useMemo(
    () => categories.find((category) => category.id === editingCategoryId) ?? null,
    [categories, editingCategoryId]
  );

  const categoryColumns = useMemo(() => {
    const left: ListBuddyCategory[] = [];
    const right: ListBuddyCategory[] = [];

    categories.forEach((category, index) => {
      if (index % 2 === 0) {
        left.push(category);
      } else {
        right.push(category);
      }
    });

    return { left, right };
  }, [categories]);

  const refreshCategories = useCallback(async () => {
    const next = await getListCategories();
    setCategories(next);
  }, []);

  const refreshItems = useCallback(async (categoryId: number) => {
    const next = await getListItems(categoryId);
    setItems(next);
  }, []);

  useEffect(() => {
    refreshCategories().catch(() => undefined);
  }, [refreshCategories]);

  useEffect(() => {
    if (!selectedCategoryId) {
      setItems([]);
      return;
    }
    refreshItems(selectedCategoryId).catch(() => undefined);
  }, [refreshItems, selectedCategoryId]);

  const openCategoryModal = (category?: ListBuddyCategory) => {
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
      Alert.alert("Category error", message);
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
    if (!selectedCategoryId) return;
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
      Alert.alert("Item error", message);
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

  const renderCategoryCard = (category: ListBuddyCategory) => {
    const percent =
      category.totalItems > 0
        ? Math.round((category.completedItems / category.totalItems) * 100)
        : 0;

    return (
      <Pressable
        key={category.id}
        onPress={() => setSelectedCategoryId(category.id)}
        className="mb-4 overflow-hidden rounded-2xl border px-4 py-3"
        style={{ borderColor: resolvedTheme.accentBorder, backgroundColor: panelBackground, maxHeight: 260 }}
      >
        <Text className="text-base font-black text-[#032D3B] dark:text-white">
          {category.name}
        </Text>
        <Text className="mt-1 text-[11px] font-semibold uppercase tracking-[1.1px] text-[#2C778D] dark:text-white/60">
          {category.completedItems}/{category.totalItems} done • {percent}%
        </Text>

        <View className="mt-3 gap-1.5">
          {category.previewItems.length === 0 && (
            <Text className="text-sm text-[#538EA0] dark:text-white/45">No list lines yet</Text>
          )}
          {category.previewItems.map((item) => (
            <Text
              key={item.id}
              numberOfLines={1}
              className={`text-xs ${
                item.completed
                  ? "text-[#7FB1C0] dark:text-white/45 line-through"
                  : "text-[#0F4D63] dark:text-white/82"
              }`}
            >
              • {item.text}
            </Text>
          ))}
        </View>
      </Pressable>
    );
  };

  const resolvedTheme = theme ?? {
    accent: isDarkMode ? "#75DFFF" : "#00C8F0",
    accentSoft: isDarkMode ? "#153847" : "#D7F7FF",
    accentBorder: isDarkMode ? "rgba(117,223,255,0.45)" : "rgba(0,200,240,0.34)",
    onAccent: "#08202A"
  };
  const backgroundColor = isDarkMode ? "#05070A" : "#F6FBFF";
  const panelBackground = isDarkMode ? "#14181D" : "#FFFFFF";
  const inputBackground = isDarkMode ? "#0B1014" : "#F5FAFD";
  const textMuted = isDarkMode ? "rgba(244,250,255,0.72)" : "#3D6F81";

  return (
    <SafeAreaView
      className="flex-1"
      edges={["top", "bottom"]}
      style={{ backgroundColor }}
    >
      <StatusBar style={isDarkMode ? "light" : "dark"} backgroundColor={backgroundColor} translucent={false} />

      <View className="border-b px-5 pb-3 pt-4" style={{ borderColor: resolvedTheme.accentBorder }}>
        {!selectedCategory && (
          <View className="flex-row items-center justify-between">
            <Pressable
              onPress={onBack}
              className="h-10 w-10 items-center justify-center rounded-xl border"
              style={{ borderColor: resolvedTheme.accentBorder, backgroundColor: panelBackground }}
            >
              <ArrowLeft size={18} color={isDarkMode ? "#FFFFFF" : textMuted} />
            </Pressable>
            <Text className="text-2xl font-black text-[#032D3B] dark:text-white">List Buddy</Text>
            <Pressable
              onPress={() => openCategoryModal()}
              className="h-10 w-10 items-center justify-center rounded-xl"
              style={{ backgroundColor: resolvedTheme.accent }}
            >
              <Plus size={18} color={resolvedTheme.onAccent} />
            </Pressable>
          </View>
        )}

        {selectedCategory && (
          <View className="flex-row items-center justify-between">
            <Pressable
              onPress={() => setSelectedCategoryId(null)}
              className="h-10 w-10 items-center justify-center rounded-xl border"
              style={{ borderColor: resolvedTheme.accentBorder, backgroundColor: panelBackground }}
            >
              <ArrowLeft size={18} color={isDarkMode ? "#FFFFFF" : textMuted} />
            </Pressable>
            <Text className="max-w-[190px] text-center text-xl font-black text-[#032D3B] dark:text-white">
              {selectedCategory.name}
            </Text>
            <Pressable
              onPress={() => openItemModal()}
              className="h-10 w-10 items-center justify-center rounded-xl"
              style={{ backgroundColor: resolvedTheme.accent }}
            >
              <Plus size={18} color={resolvedTheme.onAccent} />
            </Pressable>
          </View>
        )}
      </View>

      {!selectedCategory && (
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ padding: 20, paddingBottom: 24 }}
          keyboardShouldPersistTaps="handled"
        >
          <View className="rounded-2xl border px-4 py-3" style={{ borderColor: resolvedTheme.accentBorder, backgroundColor: resolvedTheme.accentSoft }}>
            <View className="flex-row items-center">
              <ListTodo size={20} color={resolvedTheme.accent} />
              <Text className="ml-2 text-base font-black text-[#032D3B] dark:text-white">
                Your categories
              </Text>
            </View>
            <Text className="mt-1 text-sm text-[#165B72] dark:text-white/70">
              Tap a line later to cross it out.
            </Text>
          </View>

          {categories.length === 0 && (
            <View className="mt-4 rounded-2xl border border-dashed p-4" style={{ borderColor: resolvedTheme.accentBorder, backgroundColor: panelBackground }}>
              <Text className="text-base text-[#165B72] dark:text-white/75">
                No categories yet. Create your first one.
              </Text>
            </View>
          )}

          <View className="mt-4 flex-row items-start justify-between">
            <View className="w-[48%]">{categoryColumns.left.map(renderCategoryCard)}</View>
            <View className="w-[48%]">{categoryColumns.right.map(renderCategoryCard)}</View>
          </View>
        </ScrollView>
      )}

      {selectedCategory && (
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ padding: 20, paddingBottom: 24 }}
          keyboardShouldPersistTaps="handled"
        >
          <View className="rounded-2xl border p-4" style={{ borderColor: resolvedTheme.accentBorder, backgroundColor: panelBackground }}>
            <View className="flex-row items-center justify-between">
              <Text className="text-sm font-semibold uppercase tracking-[1.3px] text-[#2C778D] dark:text-white/60">
                Progress
              </Text>
              <Pressable
                onPress={() => openCategoryModal(selectedCategory)}
                className="h-8 w-8 items-center justify-center rounded-lg border"
                style={{ borderColor: resolvedTheme.accentBorder, backgroundColor: resolvedTheme.accentSoft }}
              >
                <Pencil size={14} color={isDarkMode ? "#FFFFFF" : "#0D5D75"} />
              </Pressable>
            </View>
            <Text className="mt-1 text-xl font-black text-[#032D3B] dark:text-white">
              {selectedCategory.completedItems}/{selectedCategory.totalItems} crossed out
            </Text>
            <View className="mt-3 h-2 rounded-full bg-[#D6EDF5] dark:bg-white/15">
              <View
                className="h-2 rounded-full"
                style={{
                  backgroundColor: resolvedTheme.accent,
                  width: `${
                    selectedCategory.totalItems > 0
                      ? Math.round((selectedCategory.completedItems / selectedCategory.totalItems) * 100)
                      : 0
                  }%`
                }}
              />
            </View>
          </View>

          <View className="mt-4 rounded-2xl border" style={{ borderColor: resolvedTheme.accentBorder, backgroundColor: panelBackground }}>
            {items.length === 0 && (
              <View className="p-4">
                <Text className="text-base text-[#1C6076] dark:text-white/70">
                  No items in this category yet.
                </Text>
              </View>
            )}

            {items.map((item, index) => (
              <View
                key={item.id}
                className={`flex-row items-center px-3 py-3 ${
                  index !== items.length - 1
                    ? "border-b border-[#05AED5]/22 dark:border-white/10"
                    : ""
                }`}
              >
                <Pressable onPress={() => handleToggleItem(item)} className="flex-1 pr-3">
                  <Text
                    className={`text-base ${
                      item.completed
                        ? "text-[#7FB1C0] dark:text-white/45 line-through"
                        : "text-[#063B4F] dark:text-white/90"
                    }`}
                  >
                    {item.text}
                  </Text>
                </Pressable>

                <View className="flex-row items-center gap-2">
                  <Pressable
                    onPress={() => openItemModal(item)}
                    className="h-8 w-8 items-center justify-center rounded-lg border"
                    style={{ borderColor: resolvedTheme.accentBorder, backgroundColor: resolvedTheme.accentSoft }}
                  >
                    <Pencil size={14} color={isDarkMode ? "#FFFFFF" : "#0D5D75"} />
                  </Pressable>
                  <Pressable
                    onPress={() => handleDeleteItem(item)}
                    className="h-8 w-8 items-center justify-center rounded-lg border border-[#FF6E7F]/35 bg-[#FF6E7F]/12 dark:border-[#FF6E7F]/50 dark:bg-[#FF6E7F]/20"
                  >
                    <Trash2 size={14} color="#FF6E7F" />
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        </ScrollView>
      )}

      <Modal
        visible={categoryModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setCategoryModalOpen(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          className="flex-1 justify-center bg-black/70 px-6"
        >
          <View className="rounded-3xl border p-5" style={{ borderColor: resolvedTheme.accentBorder, backgroundColor: panelBackground }}>
            <Text className="text-2xl font-black text-[#08364A] dark:text-white">
              {editingCategoryId ? "Edit Category" : "New Category"}
            </Text>
            <TextInput
              value={categoryNameText}
              onChangeText={setCategoryNameText}
              placeholder="Movies to Watch"
              placeholderTextColor="#7A7A7A"
              className="mt-4 rounded-2xl border px-4 py-3 text-lg font-semibold"
              style={{ borderColor: resolvedTheme.accentBorder, backgroundColor: inputBackground, color: isDarkMode ? "#FFFFFF" : "#08364A" }}
            />

            <View className="mt-5 flex-row gap-3">
              <Pressable
                onPress={() => setCategoryModalOpen(false)}
                className="flex-1 items-center rounded-xl border py-3"
                style={{ borderColor: resolvedTheme.accentBorder, backgroundColor: inputBackground }}
              >
                <Text className="text-base font-semibold text-[#2A6A80] dark:text-white/75">
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                onPress={() => handleSaveCategory().catch(() => undefined)}
                className="flex-1 items-center rounded-xl py-3"
                style={{ backgroundColor: resolvedTheme.accent }}
              >
                <Text className="text-base font-black" style={{ color: resolvedTheme.onAccent }}>Save</Text>
              </Pressable>
            </View>

            {editingCategory && (
              <Pressable
                onPress={() =>
                  handleDeleteCategory(editingCategory, () => {
                    setCategoryModalOpen(false);
                    setCategoryNameText("");
                    setEditingCategoryId(null);
                  })
                }
                className="mt-3 items-center rounded-xl border border-[#FF6E7F]/45 bg-[#FF6E7F]/12 py-3"
              >
                <Text className="text-sm font-black uppercase text-[#B9495A] dark:text-[#FF8D9B]">
                  Delete Category
                </Text>
              </Pressable>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={itemModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setItemModalOpen(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          className="flex-1 justify-center bg-black/70 px-6"
        >
          <View className="rounded-3xl border p-5" style={{ borderColor: resolvedTheme.accentBorder, backgroundColor: panelBackground }}>
            <Text className="text-2xl font-black text-[#08364A] dark:text-white">
              {editingItemId ? "Edit Line Item" : "New Line Item"}
            </Text>
            <TextInput
              value={itemText}
              onChangeText={setItemText}
              placeholder="Inception"
              placeholderTextColor="#7A7A7A"
              className="mt-4 rounded-2xl border px-4 py-3 text-lg font-medium"
              style={{ borderColor: resolvedTheme.accentBorder, backgroundColor: inputBackground, color: isDarkMode ? "#FFFFFF" : "#08364A" }}
            />
            <View className="mt-5 flex-row gap-3">
              <Pressable
                onPress={() => setItemModalOpen(false)}
                className="flex-1 items-center rounded-xl border py-3"
                style={{ borderColor: resolvedTheme.accentBorder, backgroundColor: inputBackground }}
              >
                <Text className="text-base font-semibold text-[#2A6A80] dark:text-white/75">
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                onPress={() => handleSaveItem().catch(() => undefined)}
                className="flex-1 items-center rounded-xl py-3"
                style={{ backgroundColor: resolvedTheme.accent }}
              >
                <Text className="text-base font-black" style={{ color: resolvedTheme.onAccent }}>Save</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}
