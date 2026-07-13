import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from "react-native";

import { AppScreen } from "../components/AppScreen";
import { useAuth } from "../lib/AuthContext";
import { advanceOrderStatus, confirmRequest, fetchActiveOrders, fetchPendingRequests, rejectRequest } from "../lib/orders";
import { supabase } from "../lib/supabase";
import { colors, shadows, spacing } from "../theme";
import type { OrderRow, OrderStatus, RequestRow } from "../lib/types";

const nextStatus: Record<OrderStatus, OrderStatus | null> = {
  Received: "Washing",
  Washing: "Drying",
  Drying: "Ready",
  Ready: "Claimed",
  Claimed: null
};

export function WorkHubScreen() {
  const { profile, signOut } = useAuth();
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    try {
      const [nextRequests, nextOrders] = await Promise.all([fetchPendingRequests(), fetchActiveOrders()]);
      setRequests(nextRequests);
      setOrders(nextOrders);
    } catch (error) {
      Alert.alert("Couldn't load data", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch on mount, not a render loop
    loadAll();

    const channel = supabase
      .channel("bubblyfi-staff-app")
      .on("postgres_changes", { event: "*", schema: "public", table: "customer_order_requests" }, loadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, loadAll)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadAll]);

  async function handleConfirm(request: RequestRow) {
    setBusyId(request.id);
    try {
      await confirmRequest(request.id);
      await loadAll();
    } catch (error) {
      Alert.alert("Couldn't confirm", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleReject(request: RequestRow) {
    setBusyId(request.id);
    try {
      await rejectRequest(request.id);
      await loadAll();
    } catch (error) {
      Alert.alert("Couldn't reject", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleAdvance(order: OrderRow) {
    const next = nextStatus[order.status];
    if (!next) return;
    setBusyId(order.id);
    try {
      await advanceOrderStatus(order.id, next);
      await loadAll();
    } catch (error) {
      Alert.alert("Couldn't update order", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AppScreen>
      <View style={styles.topRow}>
        <View>
          <Text style={styles.heading}>Work hub</Text>
          <Text style={styles.subheading}>
            Signed in as {profile?.display_name ?? "Staff"} ({profile?.role})
          </Text>
        </View>
        <Pressable style={styles.iconButton} onPress={() => signOut()} accessibilityLabel="Sign out">
          <Ionicons name="log-out" size={20} color={colors.ink} />
        </Pressable>
      </View>

      {loading ? (
        <ActivityIndicator style={styles.loading} size="large" color={colors.primary} />
      ) : (
        <>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Pending requests</Text>
            <Pressable onPress={loadAll}>
              <Ionicons name="refresh" size={20} color={colors.primary} />
            </Pressable>
          </View>

          {requests.length === 0 ? <Text style={styles.emptyText}>No pending requests.</Text> : null}

          {requests.map((request) => (
            <View key={request.id} style={[styles.card, shadows.card]}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>{request.request_no}</Text>
                <Text style={styles.cardPrice}>₱{request.total}</Text>
              </View>
              <Text style={styles.cardMeta}>
                {request.customer_name} · {request.phone}
              </Text>
              <Text style={styles.cardMeta}>
                {request.item_type} · {request.quantity}
                {request.unit} · {request.loads} load{request.loads === 1 ? "" : "s"}
              </Text>
              <Text style={styles.cardMeta}>
                {request.delivery_requested ? `Delivery · ${request.full_address}` : "Counter drop-off"}
              </Text>
              <View style={styles.actionsRow}>
                <Pressable
                  style={[styles.actionButton, styles.confirmButton]}
                  onPress={() => handleConfirm(request)}
                  disabled={busyId === request.id}
                >
                  <Text style={styles.confirmText}>Confirm</Text>
                </Pressable>
                <Pressable
                  style={[styles.actionButton, styles.rejectButton]}
                  onPress={() => handleReject(request)}
                  disabled={busyId === request.id}
                >
                  <Text style={styles.rejectText}>Reject</Text>
                </Pressable>
              </View>
            </View>
          ))}

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Active orders</Text>
          </View>

          {orders.length === 0 ? <Text style={styles.emptyText}>No active orders.</Text> : null}

          {orders.map((order) => {
            const next = nextStatus[order.status];
            return (
              <View key={order.id} style={[styles.card, shadows.card]}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle}>{order.receipt_no}</Text>
                  <Text style={styles.cardPrice}>₱{order.total}</Text>
                </View>
                <Text style={styles.cardMeta}>{order.customers?.name ?? "Walk-in"}</Text>
                <Text style={styles.cardMeta}>
                  {order.status} · {order.loads} load{order.loads === 1 ? "" : "s"} · {order.payment_status}
                </Text>
                {next ? (
                  <Pressable
                    style={[styles.actionButton, styles.confirmButton, styles.fullWidthButton]}
                    onPress={() => handleAdvance(order)}
                    disabled={busyId === order.id}
                  >
                    <Text style={styles.confirmText}>Mark {next}</Text>
                  </Pressable>
                ) : null}
              </View>
            );
          })}
        </>
      )}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.md,
    gap: spacing.md
  },
  heading: {
    color: colors.ink,
    fontSize: 26,
    fontWeight: "900"
  },
  subheading: {
    color: colors.muted,
    marginTop: spacing.xs
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line
  },
  loading: {
    marginTop: spacing.xxl
  },
  sectionHeader: {
    marginTop: spacing.xl,
    marginBottom: spacing.md,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  sectionTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: "800"
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
    marginTop: spacing.xs
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
    alignItems: "center",
    justifyContent: "center"
  },
  fullWidthButton: {
    marginTop: spacing.md
  },
  confirmButton: {
    backgroundColor: colors.primary
  },
  confirmText: {
    color: "#FFFFFF",
    fontWeight: "900"
  },
  rejectButton: {
    backgroundColor: colors.accentSoft
  },
  rejectText: {
    color: colors.danger,
    fontWeight: "900"
  }
});
