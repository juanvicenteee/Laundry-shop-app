import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";

import type { Shop } from "../types";
import { Chip } from "./Chip";
import { colors, shadows, spacing } from "../theme";

type Props = {
  shop: Shop;
};

export function ShopCard({ shop }: Props) {
  return (
    <View style={[styles.card, shadows.card]}>
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Ionicons name="shirt" size={22} color={colors.primary} />
        </View>
        <View style={styles.nameBlock}>
          <Text style={styles.name}>{shop.name}</Text>
          <Text style={styles.meta}>{shop.address}</Text>
        </View>
        <View style={[styles.status, !shop.open && styles.closed]}>
          <Text style={[styles.statusText, !shop.open && styles.closedText]}>
            {shop.open ? "Open" : "Closed"}
          </Text>
        </View>
      </View>
      <View style={styles.metrics}>
        <Text style={styles.metric}>★ {shop.rating.toFixed(1)}</Text>
        <Text style={styles.metric}>{shop.distanceKm.toFixed(1)} km</Text>
        <Text style={styles.metric}>{shop.etaMinutes} min</Text>
        <Text style={styles.metric}>from ₱{shop.basePrice}</Text>
      </View>
      <View style={styles.tags}>
        {shop.tags.map((tag) => (
          <Chip key={tag} label={tag} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: spacing.lg,
    marginBottom: spacing.md
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primarySoft
  },
  nameBlock: {
    flex: 1
  },
  name: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "800"
  },
  meta: {
    color: colors.muted,
    marginTop: 2
  },
  status: {
    borderRadius: 8,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: colors.primarySoft
  },
  closed: {
    backgroundColor: "#EEEDE8"
  },
  statusText: {
    color: colors.primary,
    fontWeight: "800"
  },
  closedText: {
    color: colors.muted
  },
  metrics: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.md
  },
  metric: {
    color: colors.ink,
    fontWeight: "700"
  },
  tags: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.md
  }
});
