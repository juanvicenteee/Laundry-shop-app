import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from "react-native";

import { AppScreen } from "../components/AppScreen";
import { useAuth } from "../lib/AuthContext";
import { confirmRequest, fetchPendingRequests, rejectRequest } from "../lib/orders";
import { registerForPushNotifications } from "../lib/pushNotifications";
import { supabase } from "../lib/supabase";
import { colors, shadows, spacing } from "../theme";
import type { RequestRow } from "../lib/types";

export function RequestsScreen() {
  const { profile, signOut } = useAuth();
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    try {
      const nextRequests = await fetchPendingRequests();
      setRequests(nextRequests);
    } catch (error) {
      Alert.alert("Couldn't load requests", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch on mount, not a render loop
    loadAll();

    const channel = supabase
      .channel("bubblyfi-staff-requests")
      .on("postgres_changes", { event: "*", schema: "public", table: "customer_order_requests" }, loadAll)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadAll]);

  useEffect(() => {
    if (profile?.id) {
      registerForPushNotifications(profile.id);
    }
  }, [profile?.id]);

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

  return (
    <AppScreen>
      <View style={styles.topRow}>
        <View>
          <Text style={styles.heading}>Requests</Text>
          <Text style={styles.subheading}>
            Signed in as {profile?.display_name ?? "Staff"} ({profile?.role})
          </Text>
        </View>
        <Pressable style={styles.iconButton} onPress={() => signOut()} accessibilityLabel="Sign out">
          <Ionicons name="log-out" size={20} color={colors.ink} />
        </Pressable>
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Pending customer requests</Text>
        <Pressable onPress={loadAll}>
          <Ionicons name="refresh" size={20} color={colors.primary} />
        </Pressable>
      </View>

      {loading ? <ActivityIndicator style={styles.loading} size="large" color={colors.primary} /> : null}

      {!loading && requests.length === 0 ? <Text style={styles.emptyText}>No pending requests.</Text> : null}

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
