import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { AppScreen } from "../components/AppScreen";
import { useAuth } from "../lib/AuthContext";
import { advanceOrderStatus, fetchAllOrders, togglePaymentStatus, voidOrder } from "../lib/orders";
import { supabase } from "../lib/supabase";
import { colors, shadows, spacing } from "../theme";
import type { OrderRow, OrderStatus } from "../lib/types";

const statuses: OrderStatus[] = ["Received", "Washing", "Drying", "Ready", "Claimed"];
const filterOptions = ["All", ...statuses];

export function OrdersScreen() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";

  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [voidingId, setVoidingId] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState("");

  const loadOrders = useCallback(async () => {
    try {
      const rows = await fetchAllOrders();
      setOrders(rows);
    } catch (error) {
      Alert.alert("Couldn't load orders", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch on mount, not a render loop
    loadOrders();

    const channel = supabase
      .channel("bubblyfi-staff-orders")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, loadOrders)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadOrders]);

  const visibleOrders = useMemo(() => {
    const query = search.trim().toLowerCase();
    return orders.filter((order) => {
      if (statusFilter !== "All" && order.status !== statusFilter) return false;
      if (!query) return true;
      const haystack = [
        order.receipt_no,
        order.customers?.name ?? "",
        order.customers?.phone ?? "",
        order.service_type,
        order.place,
        order.status
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [orders, search, statusFilter]);

  async function handleSetStatus(order: OrderRow, status: OrderStatus) {
    if (!profile) return;
    setBusyId(order.id);
    try {
      await advanceOrderStatus(order.id, status, profile.id);
      await loadOrders();
    } catch (error) {
      Alert.alert("Couldn't update status", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleTogglePaid(order: OrderRow) {
    if (!profile) return;
    setBusyId(order.id);
    try {
      await togglePaymentStatus(order, profile.id);
      await loadOrders();
    } catch (error) {
      Alert.alert("Couldn't update payment", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleConfirmVoid() {
    if (!voidingId || !profile) return;
    if (!voidReason.trim()) {
      Alert.alert("Reason required", "Enter a reason for voiding this order.");
      return;
    }
    setBusyId(voidingId);
    try {
      await voidOrder(voidingId, voidReason.trim(), profile.id);
      setVoidingId(null);
      setVoidReason("");
      await loadOrders();
    } catch (error) {
      Alert.alert("Couldn't void order", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AppScreen>
      <Text style={styles.heading}>Orders</Text>
      <Text style={styles.subheading}>All orders, cloud-synchronized.</Text>

      <View style={[styles.searchCard, shadows.card]}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          style={styles.searchInput}
          placeholder="Search customer, receipt, status"
        />
      </View>

      <View style={styles.filterRow}>
        {filterOptions.map((option) => (
          <Pressable
            key={option}
            style={[styles.filterChip, statusFilter === option && styles.filterChipActive]}
            onPress={() => setStatusFilter(option)}
          >
            <Text style={[styles.filterChipText, statusFilter === option && styles.filterChipTextActive]}>
              {option}
            </Text>
          </Pressable>
        ))}
      </View>

      {loading ? <ActivityIndicator style={styles.loading} size="large" color={colors.primary} /> : null}

      {!loading && visibleOrders.length === 0 ? <Text style={styles.emptyText}>No orders match.</Text> : null}

      {visibleOrders.map((order) => (
        <View key={order.id} style={[styles.card, shadows.card, order.is_void && styles.voidedCard]}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>{order.receipt_no}</Text>
            <Text style={styles.cardPrice}>₱{order.total}</Text>
          </View>
          <Text style={styles.cardMeta}>{order.customers?.name ?? "Walk-in"}</Text>
          <Text style={styles.cardMeta}>
            {order.service_type} · {order.place} · {order.loads} load{order.loads === 1 ? "" : "s"}
          </Text>

          {order.is_void ? (
            <View style={styles.voidBadge}>
              <Text style={styles.voidBadgeText}>VOID · {order.void_reason}</Text>
            </View>
          ) : (
            <>
              <View style={styles.statusRow}>
                {statuses.map((status) => (
                  <Pressable
                    key={status}
                    style={[styles.statusChip, order.status === status && styles.statusChipActive]}
                    onPress={() => handleSetStatus(order, status)}
                    disabled={busyId === order.id}
                  >
                    <Text style={[styles.statusChipText, order.status === status && styles.statusChipTextActive]}>
                      {status}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <View style={styles.actionsRow}>
                <Pressable
                  style={[styles.actionButton, order.payment_status === "Paid" ? styles.paidButton : styles.unpaidButton]}
                  onPress={() => handleTogglePaid(order)}
                  disabled={busyId === order.id}
                >
                  <Text style={order.payment_status === "Paid" ? styles.paidText : styles.unpaidText}>
                    {order.payment_status}
                  </Text>
                </Pressable>
                {isAdmin ? (
                  <Pressable
                    style={[styles.actionButton, styles.voidButton]}
                    onPress={() => {
                      setVoidingId(order.id);
                      setVoidReason("");
                    }}
                    disabled={busyId === order.id}
                  >
                    <Ionicons name="close-circle" size={16} color={colors.danger} />
                    <Text style={styles.voidText}>Void</Text>
                  </Pressable>
                ) : null}
              </View>

              {voidingId === order.id ? (
                <View style={styles.voidForm}>
                  <TextInput
                    value={voidReason}
                    onChangeText={setVoidReason}
                    style={styles.searchInput}
                    placeholder="Reason for voiding this order"
                  />
                  <View style={styles.actionsRow}>
                    <Pressable style={[styles.actionButton, styles.confirmVoidButton]} onPress={handleConfirmVoid}>
                      <Text style={styles.confirmVoidText}>Confirm void</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.actionButton, styles.unpaidButton]}
                      onPress={() => {
                        setVoidingId(null);
                        setVoidReason("");
                      }}
                    >
                      <Text style={styles.unpaidText}>Cancel</Text>
                    </Pressable>
                  </View>
                </View>
              ) : null}
            </>
          )}
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
  searchCard: {
    marginTop: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: spacing.xs
  },
  searchInput: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    color: colors.ink,
    backgroundColor: "#FBFCFA"
  },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.md
  },
  filterChip: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.surface
  },
  filterChipActive: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary
  },
  filterChipText: {
    color: colors.muted,
    fontWeight: "700"
  },
  filterChipTextActive: {
    color: colors.primary
  },
  loading: {
    marginTop: spacing.xxl
  },
  emptyText: {
    color: colors.muted,
    marginTop: spacing.lg
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: spacing.lg,
    marginTop: spacing.md
  },
  voidedCard: {
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
    fontSize: 16
  },
  cardPrice: {
    color: colors.ink,
    fontWeight: "900"
  },
  cardMeta: {
    color: colors.muted,
    marginTop: spacing.xs,
    textTransform: "capitalize"
  },
  statusRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginTop: spacing.md
  },
  statusChip: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs
  },
  statusChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary
  },
  statusChipText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "800"
  },
  statusChipTextActive: {
    color: "#FFFFFF"
  },
  actionsRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.md
  },
  actionButton: {
    flex: 1,
    minHeight: 40,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs
  },
  paidButton: {
    backgroundColor: colors.primarySoft
  },
  paidText: {
    color: colors.primary,
    fontWeight: "900"
  },
  unpaidButton: {
    backgroundColor: colors.accentSoft
  },
  unpaidText: {
    color: colors.ink,
    fontWeight: "900"
  },
  voidButton: {
    backgroundColor: "#FDECEF"
  },
  voidText: {
    color: colors.danger,
    fontWeight: "900"
  },
  voidBadge: {
    marginTop: spacing.md,
    borderRadius: 8,
    padding: spacing.sm,
    backgroundColor: "#FDECEF"
  },
  voidBadgeText: {
    color: colors.danger,
    fontWeight: "800",
    fontSize: 12
  },
  voidForm: {
    marginTop: spacing.md
  },
  confirmVoidButton: {
    backgroundColor: colors.danger
  },
  confirmVoidText: {
    color: "#FFFFFF",
    fontWeight: "900"
  }
});
