import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { AppScreen } from "../components/AppScreen";
import { SectionTitle } from "../components/SectionTitle";
import { fetchMyRequests, getRememberedPhone, type MyRequest } from "../lib/myRequests";
import { colors, shadows, spacing } from "../theme";

const orderSteps = ["Received", "Washing", "Drying", "Ready", "Claimed"];

export function OrdersScreen() {
  const [phone, setPhone] = useState<string | null>(null);
  const [requests, setRequests] = useState<MyRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const storedPhone = await getRememberedPhone();
      setPhone(storedPhone);
      if (storedPhone) {
        const rows = await fetchMyRequests(storedPhone);
        setRequests(rows);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Couldn't load your orders.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch on mount, not a render loop
    load();
  }, [load]);

  return (
    <AppScreen>
      <View style={styles.topRow}>
        <View>
          <Text style={styles.heading}>Orders</Text>
          <Text style={styles.subheading}>Track your laundry from drop-off to claim.</Text>
        </View>
        <Pressable onPress={load} accessibilityLabel="Refresh orders">
          <Ionicons name="refresh" size={22} color={colors.primary} />
        </Pressable>
      </View>

      <SectionTitle title="In progress" />

      {loading ? <ActivityIndicator style={styles.spinner} size="large" color={colors.primary} /> : null}

      {!loading && !phone ? (
        <Text style={styles.emptyText}>Book your first order to start tracking it here.</Text>
      ) : null}

      {!loading && errorMessage ? <Text style={styles.emptyText}>{errorMessage}</Text> : null}

      {!loading && phone && !errorMessage && requests.length === 0 ? (
        <Text style={styles.emptyText}>No orders yet for this number.</Text>
      ) : null}

      {!loading &&
        requests.map((request) => {
          const statusIndex = request.order_status ? orderSteps.indexOf(request.order_status) : -1;
          return (
            <View key={request.id} style={[styles.card, shadows.card]}>
              <View style={styles.header}>
                <View>
                  <Text style={styles.orderId}>{request.receipt_no ?? request.request_no}</Text>
                  <Text style={styles.shop}>{request.item_type.replace(/_/g, " ")}</Text>
                </View>
                <Text style={styles.price}>₱{request.total}</Text>
              </View>
              <Text style={styles.items}>
                {request.quantity}
                {request.unit} · {request.loads} load{request.loads === 1 ? "" : "s"}
              </Text>

              {request.order_status ? (
                <View style={styles.timeline}>
                  {orderSteps.map((step, index) => {
                    const active = index <= statusIndex;
                    return (
                      <View key={step} style={styles.step}>
                        <View style={[styles.dot, active && styles.activeDot]}>
                          {active ? <Ionicons name="checkmark" size={12} color="#FFFFFF" /> : null}
                        </View>
                        <Text style={[styles.stepText, active && styles.activeStep]}>{step}</Text>
                      </View>
                    );
                  })}
                </View>
              ) : (
                <View style={styles.statusBadge}>
                  <Text style={styles.statusBadgeText}>{request.status}</Text>
                </View>
              )}

              <View style={styles.footer}>
                <View>
                  <Text style={styles.footerLabel}>{request.delivery_requested ? "Delivery" : "Pickup"}</Text>
                  <Text style={styles.footerValue}>
                    {request.delivery_requested ? request.full_address : "At counter"}
                  </Text>
                </View>
              </View>
            </View>
          );
        })}
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
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "900"
  },
  subheading: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
    marginTop: spacing.sm
  },
  spinner: {
    marginTop: spacing.xl
  },
  emptyText: {
    color: colors.muted,
    marginTop: spacing.sm
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: spacing.lg,
    marginBottom: spacing.md
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.lg
  },
  orderId: {
    color: colors.ink,
    fontWeight: "900",
    fontSize: 18
  },
  shop: {
    color: colors.muted,
    marginTop: spacing.xs,
    textTransform: "capitalize"
  },
  price: {
    color: colors.ink,
    fontSize: 20,
    fontWeight: "900"
  },
  items: {
    color: colors.muted,
    marginTop: spacing.md
  },
  timeline: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.xl
  },
  step: {
    alignItems: "center",
    width: 58
  },
  dot: {
    width: 24,
    height: 24,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.line
  },
  activeDot: {
    backgroundColor: colors.primary
  },
  stepText: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "800",
    marginTop: spacing.xs,
    textAlign: "center"
  },
  activeStep: {
    color: colors.ink
  },
  statusBadge: {
    alignSelf: "flex-start",
    marginTop: spacing.lg,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.primarySoft
  },
  statusBadgeText: {
    color: colors.primary,
    fontWeight: "800"
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    marginTop: spacing.lg,
    paddingTop: spacing.lg
  },
  footerLabel: {
    color: colors.muted,
    fontWeight: "700"
  },
  footerValue: {
    color: colors.ink,
    fontWeight: "900",
    marginTop: spacing.xs
  }
});
