import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { AppScreen } from "../components/AppScreen";
import { SectionTitle } from "../components/SectionTitle";
import { ShopCard } from "../components/ShopCard";
import { activeOrders, shops } from "../data/demo";
import { colors, shadows, spacing } from "../theme";

export function HomeScreen() {
  const activeOrder = activeOrders[0];

  return (
    <AppScreen>
      <View style={styles.topRow}>
        <View>
          <Text style={styles.eyebrow}>Laundry Go</Text>
          <Text style={styles.heading}>Clean clothes, picked up fast</Text>
        </View>
        <Pressable style={styles.iconButton} accessibilityLabel="Open notifications">
          <Ionicons name="notifications" size={20} color={colors.ink} />
        </Pressable>
      </View>

      <LinearGradient colors={["#0D8F68", "#145E4C"]} style={styles.hero}>
        <View style={styles.heroCopy}>
          <Text style={styles.heroTitle}>Pickup in 14 minutes</Text>
          <Text style={styles.heroText}>Book nearby laundry shops with live rider tracking.</Text>
        </View>
        <View style={styles.heroIcon}>
          <Ionicons name="bicycle" size={48} color="#FFFFFF" />
        </View>
      </LinearGradient>

      {activeOrder ? (
        <>
          <SectionTitle title="Active order" action="Track" />
          <View style={[styles.orderCard, shadows.card]}>
            <View style={styles.orderHeader}>
              <Text style={styles.orderId}>{activeOrder.id}</Text>
              <Text style={styles.orderStatus}>{activeOrder.status}</Text>
            </View>
            <Text style={styles.orderText}>{activeOrder.items}</Text>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${activeOrder.progress * 100}%` }]} />
            </View>
            <View style={styles.orderFooter}>
              <Text style={styles.orderText}>{activeOrder.shopName}</Text>
              <Text style={styles.orderEta}>{activeOrder.eta}</Text>
            </View>
          </View>
        </>
      ) : null}

      <SectionTitle title="Nearby shops" action="See all" />
      {shops.map((shop) => (
        <ShopCard key={shop.id} shop={shop} />
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
  eyebrow: {
    color: colors.primary,
    fontWeight: "900",
    letterSpacing: 0
  },
  heading: {
    maxWidth: 280,
    marginTop: spacing.xs,
    color: colors.ink,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: "900"
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
  hero: {
    minHeight: 148,
    borderRadius: 8,
    marginTop: spacing.xl,
    padding: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    overflow: "hidden"
  },
  heroCopy: {
    flex: 1
  },
  heroTitle: {
    color: "#FFFFFF",
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "900"
  },
  heroText: {
    color: "#E6FFF5",
    marginTop: spacing.sm,
    fontSize: 15,
    lineHeight: 21
  },
  heroIcon: {
    width: 82,
    height: 82,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.16)"
  },
  orderCard: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: spacing.lg
  },
  orderHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  orderId: {
    color: colors.ink,
    fontWeight: "900"
  },
  orderStatus: {
    color: colors.info,
    fontWeight: "900"
  },
  orderText: {
    color: colors.muted,
    marginTop: spacing.sm
  },
  progressTrack: {
    height: 8,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: colors.line,
    marginTop: spacing.lg
  },
  progressFill: {
    height: "100%",
    backgroundColor: colors.primary
  },
  orderFooter: {
    marginTop: spacing.sm,
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.md
  },
  orderEta: {
    color: colors.ink,
    fontWeight: "900",
    marginTop: spacing.sm
  }
});
