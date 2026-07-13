import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";

import { AppScreen } from "../components/AppScreen";
import { SectionTitle } from "../components/SectionTitle";
import { laundryTypes, pricePerLoad, shopInfo } from "../data/demo";
import { fetchMyRequests, getRememberedPhone, type MyRequest } from "../lib/myRequests";
import { colors, shadows, spacing } from "../theme";

export function HomeScreen() {
  const [activeOrder, setActiveOrder] = useState<MyRequest | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const phone = await getRememberedPhone();
        if (!phone) return;
        const requests = await fetchMyRequests(phone);
        const active = requests.find((request) => request.status !== "Rejected" && request.order_status !== "Claimed");
        if (active) setActiveOrder(active);
      } catch {
        // Home screen preview is best-effort; Orders tab shows the full picture with error states.
      }
    }

    load();
  }, []);

  return (
    <AppScreen>
      <View style={styles.topRow}>
        <View>
          <Text style={styles.eyebrow}>{shopInfo.name}</Text>
          <Text style={styles.heading}>Fresh laundry, done right</Text>
        </View>
        <Pressable style={styles.iconButton} accessibilityLabel="Open notifications">
          <Ionicons name="notifications" size={20} color={colors.ink} />
        </Pressable>
      </View>

      <LinearGradient colors={[colors.primary, colors.primaryDark]} style={styles.hero}>
        <View style={styles.heroCopy}>
          <Text style={styles.heroTitle}>₱{pricePerLoad} per load</Text>
          <Text style={styles.heroText}>Drop off at the counter, or add delivery at checkout.</Text>
        </View>
        <View style={styles.heroIcon}>
          <Ionicons name="shirt" size={48} color="#FFFFFF" />
        </View>
      </LinearGradient>

      {activeOrder ? (
        <>
          <SectionTitle title="Active order" action="Track" />
          <View style={[styles.orderCard, shadows.card]}>
            <View style={styles.orderHeader}>
              <Text style={styles.orderId}>{activeOrder.receipt_no ?? activeOrder.request_no}</Text>
              <Text style={styles.orderStatus}>{activeOrder.order_status ?? activeOrder.status}</Text>
            </View>
            <Text style={styles.orderText}>{activeOrder.item_type.replace(/_/g, " ")}</Text>
            <View style={styles.orderFooter}>
              <Text style={styles.orderText}>
                {activeOrder.loads} load{activeOrder.loads === 1 ? "" : "s"}
              </Text>
              <Text style={styles.orderEta}>₱{activeOrder.total}</Text>
            </View>
          </View>
        </>
      ) : null}

      <SectionTitle title="Shop info" />
      <View style={[styles.infoCard, shadows.card]}>
        <Pressable
          style={styles.infoRow}
          onPress={() =>
            Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(shopInfo.address)}`)
          }
        >
          <Ionicons name="location" size={18} color={colors.primary} />
          <Text style={[styles.infoText, styles.link]}>{shopInfo.address}</Text>
        </Pressable>
        <View style={styles.infoRow}>
          <Ionicons name="time" size={18} color={colors.primary} />
          <Text style={styles.infoText}>{shopInfo.hours}</Text>
        </View>
        <Pressable style={styles.infoRow} onPress={() => Linking.openURL(`tel:${shopInfo.phone}`)}>
          <Ionicons name="call" size={18} color={colors.primary} />
          <Text style={[styles.infoText, styles.link]}>{shopInfo.phone}</Text>
        </Pressable>
        <Pressable
          style={styles.directionsButton}
          onPress={() =>
            Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(shopInfo.address)}`)
          }
        >
          <Ionicons name="navigate" size={16} color="#FFFFFF" />
          <Text style={styles.directionsText}>Get directions</Text>
        </Pressable>
      </View>

      <SectionTitle title="Services" />
      {laundryTypes.map((type) => (
        <View key={type.id} style={[styles.serviceCard, shadows.card]}>
          <Text style={styles.serviceName}>{type.label}</Text>
          <Text style={styles.serviceMeta}>
            up to {type.capacity}
            {type.unit}/load · ₱{pricePerLoad}
          </Text>
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
  },
  infoCard: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: spacing.lg,
    gap: spacing.md
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  infoText: {
    color: colors.ink,
    fontWeight: "700",
    flexShrink: 1
  },
  link: {
    color: colors.primary
  },
  directionsButton: {
    height: 44,
    marginTop: spacing.xs,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.primary
  },
  directionsText: {
    color: "#FFFFFF",
    fontWeight: "900"
  },
  serviceCard: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: spacing.lg,
    marginBottom: spacing.md
  },
  serviceName: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "800"
  },
  serviceMeta: {
    color: colors.muted,
    marginTop: spacing.xs
  }
});
