import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { AppScreen } from "../components/AppScreen";
import { SectionTitle } from "../components/SectionTitle";
import { colors, shadows, spacing } from "../theme";

const jobs = [
  { id: "P-812", type: "Pickup", customer: "J. Santos", area: "BGC", eta: "8 min" },
  { id: "D-447", type: "Delivery", customer: "M. Lim", area: "Makati", eta: "18 min" },
  { id: "Q-129", type: "Shop check", customer: "A. Reyes", area: "WashMate", eta: "Due now" }
];

export function OperationsScreen() {
  return (
    <AppScreen>
      <Text style={styles.heading}>Work hub</Text>
      <Text style={styles.subheading}>Accept pickups, hand off bags, and update laundry status.</Text>

      <View style={styles.modeRow}>
        <Pressable style={[styles.mode, styles.modeActive]}>
          <Ionicons name="bicycle" size={20} color={colors.primary} />
          <Text style={styles.modeActiveText}>Rider</Text>
        </Pressable>
        <Pressable style={styles.mode}>
          <Ionicons name="storefront" size={20} color={colors.muted} />
          <Text style={styles.modeText}>Shop</Text>
        </Pressable>
      </View>

      <SectionTitle title="Available jobs" />
      {jobs.map((job) => (
        <View key={job.id} style={[styles.jobCard, shadows.card]}>
          <View style={styles.jobIcon}>
            <Ionicons name={job.type === "Delivery" ? "cube" : "bag-handle"} size={22} color={colors.primary} />
          </View>
          <View style={styles.jobBody}>
            <Text style={styles.jobType}>{job.type}</Text>
            <Text style={styles.jobMeta}>
              {job.customer} · {job.area}
            </Text>
          </View>
          <View style={styles.jobSide}>
            <Text style={styles.jobEta}>{job.eta}</Text>
            <Pressable style={styles.acceptButton}>
              <Text style={styles.acceptText}>Accept</Text>
            </Pressable>
          </View>
        </View>
      ))}

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
          <Ionicons name="location" size={24} color={colors.accent} />
          <Text style={styles.controlTitle}>Live GPS</Text>
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
  modeRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.xl
  },
  mode: {
    flex: 1,
    height: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.surface
  },
  modeActive: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary
  },
  modeText: {
    color: colors.muted,
    fontWeight: "900"
  },
  modeActiveText: {
    color: colors.primary,
    fontWeight: "900"
  },
  jobCard: {
    minHeight: 92,
    borderRadius: 8,
    padding: spacing.md,
    backgroundColor: colors.surface,
    marginBottom: spacing.md,
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
    minWidth: 72,
    minHeight: 34,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary
  },
  acceptText: {
    color: "#FFFFFF",
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
