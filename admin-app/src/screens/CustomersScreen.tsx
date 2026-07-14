import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { AppScreen } from "../components/AppScreen";
import { useAuth } from "../lib/AuthContext";
import { fetchCustomers, saveCustomer, setCustomerArchived } from "../lib/customers";
import { fetchAllOrders } from "../lib/orders";
import { supabase } from "../lib/supabase";
import { colors, shadows, spacing } from "../theme";
import type { CustomerRow, CustomerWithStats, OrderRow } from "../lib/types";

const places: { id: "cubao" | "mplace" | "outside"; label: string }[] = [
  { id: "cubao", label: "Cubao" },
  { id: "mplace", label: "MPlace" },
  { id: "outside", label: "Outside Cubao" }
];

export function CustomersScreen() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";

  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [place, setPlace] = useState<"cubao" | "mplace" | "outside">("cubao");
  const [notes, setNotes] = useState("");

  const load = useCallback(async () => {
    try {
      const [nextCustomers, nextOrders] = await Promise.all([fetchCustomers(), fetchAllOrders()]);
      setCustomers(nextCustomers);
      setOrders(nextOrders);
    } catch (error) {
      Alert.alert("Couldn't load customers", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch on mount, not a render loop
    load();

    const channel = supabase
      .channel("bubblyfi-staff-customers")
      .on("postgres_changes", { event: "*", schema: "public", table: "customers" }, load)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  const customersWithStats: CustomerWithStats[] = useMemo(() => {
    return customers.map((customer) => {
      const customerOrders = orders.filter((order) => order.customer_id === customer.id && !order.is_void);
      const totalSpent = customerOrders
        .filter((order) => order.payment_status === "Paid")
        .reduce((sum, order) => sum + Number(order.total), 0);
      return { ...customer, orderCount: customerOrders.length, totalSpent };
    });
  }, [customers, orders]);

  function clearForm() {
    setEditingId(null);
    setName("");
    setPhone("");
    setPlace("cubao");
    setNotes("");
  }

  function startEdit(customer: CustomerRow) {
    setEditingId(customer.id);
    setName(customer.name);
    setPhone(customer.phone ?? "");
    setPlace(customer.default_place);
    setNotes(customer.notes ?? "");
  }

  async function handleSave() {
    if (!profile) return;
    if (!name.trim()) {
      Alert.alert("Name required", "Enter the customer's name.");
      return;
    }

    setSaving(true);
    try {
      await saveCustomer({ name: name.trim(), phone: phone.trim(), default_place: place, notes: notes.trim() }, profile.id, editingId ?? undefined);
      clearForm();
      await load();
    } catch (error) {
      Alert.alert("Couldn't save customer", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleArchiveToggle(customer: CustomerWithStats) {
    if (!profile) return;
    setBusyId(customer.id);
    try {
      await setCustomerArchived(customer.id, !customer.is_archived, profile.id);
      await load();
    } catch (error) {
      Alert.alert("Couldn't update customer", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AppScreen>
      <Text style={styles.heading}>Customers</Text>
      <Text style={styles.subheading}>Shared cloud records.</Text>

      <View style={[styles.formCard, shadows.card]}>
        <Text style={styles.formTitle}>{editingId ? "Edit customer" : "Add customer"}</Text>
        <Text style={styles.label}>Name</Text>
        <TextInput value={name} onChangeText={setName} style={styles.input} placeholder="Customer name" />
        <Text style={styles.label}>Phone</Text>
        <TextInput
          value={phone}
          onChangeText={setPhone}
          style={styles.input}
          placeholder="09XX XXX XXXX"
          keyboardType="phone-pad"
        />
        <Text style={styles.label}>Default place</Text>
        <View style={styles.wrap}>
          {places.map((option) => (
            <Pressable
              key={option.id}
              style={[styles.chip, place === option.id && styles.chipActive]}
              onPress={() => setPlace(option.id)}
            >
              <Text style={[styles.chipText, place === option.id && styles.chipTextActive]}>{option.label}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.label}>Notes</Text>
        <TextInput
          value={notes}
          onChangeText={setNotes}
          style={[styles.input, styles.notesInput]}
          placeholder="Gate code, preferences"
          multiline
        />
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

      <Text style={styles.sectionTitle}>All customers</Text>

      {loading ? <ActivityIndicator style={styles.loading} size="large" color={colors.primary} /> : null}

      {!loading && customersWithStats.length === 0 ? <Text style={styles.emptyText}>No customers yet.</Text> : null}

      {customersWithStats.map((customer) => (
        <View key={customer.id} style={[styles.card, shadows.card, customer.is_archived && styles.archivedCard]}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>
              {customer.name}
              {customer.is_archived ? " (Archived)" : ""}
            </Text>
            <Text style={styles.cardMeta}>{customer.orderCount} orders</Text>
          </View>
          <Text style={styles.cardMeta}>{customer.phone || "No phone"}</Text>
          <Text style={styles.cardMeta}>
            {places.find((option) => option.id === customer.default_place)?.label} · ₱{customer.totalSpent} spent
          </Text>
          <View style={styles.actionsRow}>
            <Pressable style={[styles.actionButton, styles.editButton]} onPress={() => startEdit(customer)}>
              <Text style={styles.editText}>Edit</Text>
            </Pressable>
            {isAdmin && customer.name !== "Walk-in Customer" ? (
              <Pressable
                style={[styles.actionButton, styles.archiveButton]}
                onPress={() => handleArchiveToggle(customer)}
                disabled={busyId === customer.id}
              >
                <Text style={styles.archiveText}>{customer.is_archived ? "Restore" : "Archive"}</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ))}
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
  notesInput: {
    minHeight: 70,
    paddingTop: spacing.sm,
    textAlignVertical: "top"
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
  archivedCard: {
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
