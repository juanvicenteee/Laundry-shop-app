import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { AppScreen } from "../components/AppScreen";
import { SectionTitle } from "../components/SectionTitle";
import { activeOrders, laundryTypes } from "../data/demo";
import { colors, shadows, spacing } from "../theme";
import type { OrderStatus } from "../types";

const nextStatus: Record<OrderStatus, OrderStatus | null> = {
  Received: "Washing",
  Washing: "Drying",
  Drying: "Ready",
  Ready: "Claimed",
  Claimed: null
};

export function OperationsScreen() {
  return (
    <AppScreen>
      <Text style={styles.heading}>Work hub</Text>
      <Text style={styles.subheading}>Move orders through wash, dry, and claim.</Text>

      <SectionTitle title="Active orders" />
      {activeOrders.map((order) => {
        const type = laundryTypes.find((item) => item.id === order.laundryType);
        const next = nextStatus[order.status];
        return (
          <View key={order.id} style={[styles.jobCard, shadows.card]}>
            <View style={styles.jobIcon}>
              <Ionicons name="shirt" size={22} color={colors.primary} />
            </View>
            <View style={styles.jobBody}>
              <Text style={styles.jobType}>
                {order.id} · {type?.label}
              </Text>
              <Text style={styles.jobMeta}>
                {order.status} · {order.loads} load{order.loads === 1 ? "" : "s"}
              </Text>
            </View>
            <View style={styles.jobSide}>
              <Text style={styles.jobEta}>₱{order.amount}</Text>
              {next ? (
                <Pressable style={styles.acceptButton}>
                  <Text style={styles.acceptText}>Mark {next}</Text>
                </Pressable>
              ) : (
                <View style={styles.doneBadge}>
                  <Text style={styles.doneText}>Done</Text>
                </View>
              )}
            </View>
          </View>
        );
      })}

      <SectionTitle title="Controls" />
      <View style={styles.controlGrid}>
        <View style={styles.control}>
          <Ionicons name="scan" size={24} color={colors.info} />
          <Text style={styles.controlTitle}>Bag scan</Text>
        </View>
        <View style={styles.control}>
          <Ionicons name="shield-checkmark" size={24} color={colors.primary} />
          <Text style={styles.controlTitle}>Handoff PIN</Text>
        </View>
        <View style={styles.control}>
          <Ionicons name="cube" size={24} color={colors.accent} />
          <Text style={styles.controlTitle}>Inventory</Text>
        </View>
        <View style={styles.control}>
          <Ionicons name="warning" size={24} color={colors.danger} />
          <Text style={styles.controlTitle}>Issue report</Text>
        </View>
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  heading: {
    marginTop: spacing.md,
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
  jobCard: {
    minHeight: 92,
    borderRadius: 8,
    padding: spacing.md,
    backgroundColor: colors.surface,
    marginTop: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md
  },
  jobIcon: {
    width: 46,
    height: 46,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primarySoft
  },
  jobBody: {
    flex: 1
  },
  jobType: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "900"
  },
  jobMeta: {
    color: colors.muted,
    marginTop: spacing.xs
  },
  jobSide: {
    alignItems: "flex-end",
    gap: spacing.sm
  },
  jobEta: {
    color: colors.ink,
    fontWeight: "900"
  },
  acceptButton: {
    minWidth: 96,
    minHeight: 34,
    paddingHorizontal: spacing.sm,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary
  },
  acceptText: {
    color: "#FFFFFF",
    fontWeight: "900"
  },
  doneBadge: {
    minWidth: 72,
    minHeight: 34,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.line
  },
  doneText: {
    color: colors.muted,
    fontWeight: "900"
  },
  controlGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md
  },
  control: {
    width: "47%",
    minHeight: 94,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm
  },
  controlTitle: {
    color: colors.ink,
    fontWeight: "900"
  }
});
