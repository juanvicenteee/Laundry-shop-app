import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { AppScreen } from "../components/AppScreen";
import { useAuth } from "../lib/AuthContext";
import { fetchInventory, saveInventoryItem, setInventoryActive } from "../lib/inventory";
import { supabase } from "../lib/supabase";
import { colors, shadows, spacing } from "../theme";
import type { InventoryCategory, InventoryRow } from "../lib/types";

const categories: InventoryCategory[] = ["Detergent", "Fabric conditioner", "Packaging", "Maintenance", "Other"];

export function InventoryScreen() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";

  const [items, setItems] = useState<InventoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<InventoryCategory>("Detergent");
  const [stock, setStock] = useState("0");
  const [reorderLevel, setReorderLevel] = useState("0");
  const [unitCost, setUnitCost] = useState("0");
  const [customerPrice, setCustomerPrice] = useState("10");
  const [consumption, setConsumption] = useState("1");

  const load = useCallback(async () => {
    try {
      const rows = await fetchInventory();
      setItems(rows);
    } catch (error) {
      Alert.alert("Couldn't load inventory", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch on mount, not a render loop
    load();

    const channel = supabase
      .channel("bubblyfi-staff-inventory")
      .on("postgres_changes", { event: "*", schema: "public", table: "inventory" }, load)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  function clearForm() {
    setEditingId(null);
    setName("");
    setCategory("Detergent");
    setStock("0");
    setReorderLevel("0");
    setUnitCost("0");
    setCustomerPrice("10");
    setConsumption("1");
  }

  function startEdit(item: InventoryRow) {
    setEditingId(item.id);
    setName(item.name);
    setCategory(item.category);
    setStock(String(item.stock));
    setReorderLevel(String(item.reorder_level));
    setUnitCost(String(item.unit_cost));
    setCustomerPrice(String(item.customer_price_per_load));
    setConsumption(String(item.consumption_per_load));
  }

  async function handleSave() {
    if (!profile) return;
    if (!name.trim()) {
      Alert.alert("Name required", "Enter the item name.");
      return;
    }

    setSaving(true);
    try {
      await saveInventoryItem(
        {
          name: name.trim(),
          category,
          stock: Number(stock) || 0,
          reorder_level: Number(reorderLevel) || 0,
          unit_cost: Number(unitCost) || 0,
          customer_price_per_load: Number(customerPrice) || 0,
          consumption_per_load: Number(consumption) || 1
        },
        profile.id,
        editingId ?? undefined
      );
      clearForm();
      await load();
    } catch (error) {
      Alert.alert("Couldn't save item", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(item: InventoryRow) {
    if (!profile) return;
    setBusyId(item.id);
    try {
      await setInventoryActive(item.id, !item.is_active, profile.id);
      await load();
    } catch (error) {
      Alert.alert("Couldn't update item", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AppScreen>
      <Text style={styles.heading}>Inventory</Text>
      <Text style={styles.subheading}>Low stock highlighted.</Text>

      <View style={[styles.formCard, shadows.card]}>
        <Text style={styles.formTitle}>{editingId ? "Edit item" : "Add item"}</Text>
        <Text style={styles.label}>Item name</Text>
        <TextInput value={name} onChangeText={setName} style={styles.input} placeholder="Powder detergent" />
        <Text style={styles.label}>Category</Text>
        <View style={styles.wrap}>
          {categories.map((option) => (
            <Pressable
              key={option}
              style={[styles.chip, category === option && styles.chipActive]}
              onPress={() => setCategory(option)}
            >
              <Text style={[styles.chipText, category === option && styles.chipTextActive]}>{option}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.row}>
          <View style={styles.half}>
            <Text style={styles.label}>Stock</Text>
            <TextInput value={stock} onChangeText={setStock} style={styles.input} keyboardType="numeric" />
          </View>
          <View style={styles.half}>
            <Text style={styles.label}>Reorder level</Text>
            <TextInput
              value={reorderLevel}
              onChangeText={setReorderLevel}
              style={styles.input}
              keyboardType="numeric"
            />
          </View>
        </View>
        <View style={styles.row}>
          <View style={styles.half}>
            <Text style={styles.label}>Unit cost</Text>
            <TextInput value={unitCost} onChangeText={setUnitCost} style={styles.input} keyboardType="numeric" />
          </View>
          <View style={styles.half}>
            <Text style={styles.label}>Usage per load</Text>
            <TextInput value={consumption} onChangeText={setConsumption} style={styles.input} keyboardType="numeric" />
          </View>
        </View>
        {isAdmin ? (
          <>
            <Text style={styles.label}>Customer price per load</Text>
            <TextInput
              value={customerPrice}
              onChangeText={setCustomerPrice}
              style={styles.input}
              keyboardType="numeric"
            />
          </>
        ) : null}
        <View style={styles.actionsRow}>
          <Pressable style={[styles.actionButton, styles.saveButton]} onPress={handleSave} disabled={saving}>
            {saving ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={styles.saveText}>Save</Text>}
          </Pressable>
          {editingId ? (
            <Pressable style={[styles.actionButton, styles.clearButton]} onPress={clearForm}>
              <Text style={styles.clearText}>Cancel</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      <Text style={styles.sectionTitle}>All items</Text>

      {loading ? <ActivityIndicator style={styles.loading} size="large" color={colors.primary} /> : null}

      {!loading && items.length === 0 ? <Text style={styles.emptyText}>No inventory items yet.</Text> : null}

      {items.map((item) => {
        const low = item.stock <= item.reorder_level;
        return (
          <View key={item.id} style={[styles.card, shadows.card, !item.is_active && styles.inactiveCard]}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>
                {item.name}
                {!item.is_active ? " (Inactive)" : ""}
              </Text>
              {low ? (
                <View style={styles.lowBadge}>
                  <Text style={styles.lowBadgeText}>Reorder</Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.cardMeta}>{item.category}</Text>
            <Text style={styles.cardMeta}>
              Stock {item.stock} / reorder at {item.reorder_level} · ₱{item.unit_cost} cost
            </Text>
            <Text style={styles.cardMeta}>
              ₱{item.customer_price_per_load}/load to customer · {item.consumption_per_load}/load used
            </Text>
            <View style={styles.actionsRow}>
              <Pressable style={[styles.actionButton, styles.editButton]} onPress={() => startEdit(item)}>
                <Text style={styles.editText}>Edit</Text>
              </Pressable>
              {isAdmin ? (
                <Pressable
                  style={[styles.actionButton, styles.archiveButton]}
                  onPress={() => handleToggleActive(item)}
                  disabled={busyId === item.id}
                >
                  <Text style={styles.archiveText}>{item.is_active ? "Inactivate" : "Activate"}</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        );
      })}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  heading: {
    marginTop: spacing.md,
    color: colors.ink,
    fontSize: 26,
    fontWeight: "900"
  },
  subheading: {
    color: colors.muted,
    marginTop: spacing.xs
  },
  formCard: {
    marginTop: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: spacing.lg
  },
  formTitle: {
    color: colors.ink,
    fontWeight: "900",
    fontSize: 16
  },
  label: {
    color: colors.ink,
    fontWeight: "800",
    marginBottom: spacing.sm,
    marginTop: spacing.md
  },
  input: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    color: colors.ink,
    backgroundColor: "#FBFCFA"
  },
  row: {
    flexDirection: "row",
    gap: spacing.md
  },
  half: {
    flex: 1
  },
  wrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  chip: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.surface
  },
  chipActive: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary
  },
  chipText: {
    color: colors.muted,
    fontWeight: "700"
  },
  chipTextActive: {
    color: colors.primary
  },
  actionsRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.lg
  },
  actionButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center"
  },
  saveButton: {
    backgroundColor: colors.primary
  },
  saveText: {
    color: "#FFFFFF",
    fontWeight: "900"
  },
  clearButton: {
    backgroundColor: colors.accentSoft
  },
  clearText: {
    color: colors.ink,
    fontWeight: "900"
  },
  sectionTitle: {
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
    color: colors.ink,
    fontSize: 18,
    fontWeight: "800"
  },
  loading: {
    marginTop: spacing.xl
  },
  emptyText: {
    color: colors.muted
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: spacing.lg,
    marginBottom: spacing.md
  },
  inactiveCard: {
    opacity: 0.6
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  cardTitle: {
    color: colors.ink,
    fontWeight: "900",
    fontSize: 16,
    flexShrink: 1
  },
  cardMeta: {
    color: colors.muted,
    marginTop: spacing.xs
  },
  lowBadge: {
    borderRadius: 8,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: "#FFF3E3"
  },
  lowBadgeText: {
    color: "#9B5B00",
    fontWeight: "800",
    fontSize: 12
  },
  editButton: {
    backgroundColor: colors.primarySoft
  },
  editText: {
    color: colors.primary,
    fontWeight: "900"
  },
  archiveButton: {
    backgroundColor: colors.accentSoft
  },
  archiveText: {
    color: colors.ink,
    fontWeight: "900"
  }
});
