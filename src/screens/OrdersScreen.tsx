import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";

import { AppScreen } from "../components/AppScreen";
import { SectionTitle } from "../components/SectionTitle";
import { activeOrders, laundryTypes } from "../data/demo";
import { colors, shadows, spacing } from "../theme";
import type { OrderStatus } from "../types";

const steps: OrderStatus[] = ["Received", "Washing", "Drying", "Ready", "Claimed"];

export function OrdersScreen() {
  return (
    <AppScreen>
      <Text style={styles.heading}>Orders</Text>
      <Text style={styles.subheading}>Track your laundry from drop-off to claim.</Text>

      <SectionTitle title="In progress" />
      {activeOrders.map((order) => {
        const type = laundryTypes.find((item) => item.id === order.laundryType);
        const statusIndex = steps.indexOf(order.status);
        return (
          <View key={order.id} style={[styles.card, shadows.card]}>
            <View style={styles.header}>
              <View>
                <Text style={styles.orderId}>{order.id}</Text>
                <Text style={styles.shop}>{type?.label}</Text>
              </View>
              <Text style={styles.price}>₱{order.amount}</Text>
            </View>
            <Text style={styles.items}>
              {order.quantity}
              {type?.unit} · {order.loads} load{order.loads === 1 ? "" : "s"}
            </Text>
            <View style={styles.timeline}>
              {steps.map((step, index) => {
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
            <View style={styles.footer}>
              <View>
                <Text style={styles.footerLabel}>Payment</Text>
                <Text style={styles.footerValue}>
                  {order.paymentMethod} · {order.paymentStatus}
                </Text>
              </View>
              <View>
                <Text style={styles.footerLabel}>{order.delivery > 0 ? "Delivery" : "Pickup"}</Text>
                <Text style={styles.footerValue}>
                  {order.delivery > 0 ? `₱${order.delivery} fee` : "At counter"}
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
    marginTop: spacing.xs
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
