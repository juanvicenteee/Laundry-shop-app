import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { AppScreen } from "../components/AppScreen";
import { SectionTitle } from "../components/SectionTitle";
import { colors, shadows, spacing } from "../theme";

const transactions = [
  { id: "T-9281", label: "WashMate Express", amount: "-₱318", status: "Paid" },
  { id: "T-9274", label: "Wallet top up", amount: "+₱1,000", status: "Completed" },
  { id: "T-9250", label: "FreshFold Laundry", amount: "-₱242", status: "Paid" }
];

export function WalletScreen() {
  return (
    <AppScreen>
      <Text style={styles.heading}>Wallet</Text>
      <Text style={styles.subheading}>Use stored value, cards, or cash-on-delivery settings.</Text>

      <View style={[styles.balanceCard, shadows.card]}>
        <Text style={styles.balanceLabel}>Available balance</Text>
        <Text style={styles.balance}>₱1,482.00</Text>
        <View style={styles.actions}>
          <Pressable style={styles.actionButton}>
            <Ionicons name="add-circle" size={20} color="#FFFFFF" />
            <Text style={styles.actionText}>Top up</Text>
          </Pressable>
          <Pressable style={styles.secondaryButton}>
            <Ionicons name="card" size={20} color={colors.ink} />
            <Text style={styles.secondaryText}>Cards</Text>
          </Pressable>
        </View>
      </View>

      <SectionTitle title="Payment safety" />
      <View style={styles.safetyCard}>
        <Ionicons name="lock-closed" size={22} color={colors.primary} />
        <Text style={styles.safetyText}>
          Payment confirmation should come from provider webhooks before orders are marked paid.
        </Text>
      </View>

      <SectionTitle title="Recent activity" />
      {transactions.map((transaction) => (
        <View key={transaction.id} style={styles.transaction}>
          <View>
            <Text style={styles.transactionLabel}>{transaction.label}</Text>
            <Text style={styles.transactionStatus}>{transaction.status}</Text>
          </View>
          <Text style={styles.transactionAmount}>{transaction.amount}</Text>
        </View>
      ))}
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
  balanceCard: {
    marginTop: spacing.xl,
    borderRadius: 8,
    padding: spacing.lg,
    backgroundColor: colors.ink
  },
  balanceLabel: {
    color: "#C8D8D0",
    fontWeight: "800"
  },
  balance: {
    color: "#FFFFFF",
    fontSize: 34,
    lineHeight: 42,
    fontWeight: "900",
    marginTop: spacing.sm
  },
  actions: {
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.lg
  },
  actionButton: {
    flex: 1,
    height: 48,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.primary
  },
  actionText: {
    color: "#FFFFFF",
    fontWeight: "900"
  },
  secondaryButton: {
    flex: 1,
    height: 48,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: "#FFFFFF"
  },
  secondaryText: {
    color: colors.ink,
    fontWeight: "900"
  },
  safetyCard: {
    flexDirection: "row",
    gap: spacing.md,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    padding: spacing.lg
  },
  safetyText: {
    flex: 1,
    color: colors.muted,
    lineHeight: 21
  },
  transaction: {
    minHeight: 68,
    borderRadius: 8,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    backgroundColor: colors.surface,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md
  },
  transactionLabel: {
    color: colors.ink,
    fontWeight: "900"
  },
  transactionStatus: {
    color: colors.muted,
    marginTop: spacing.xs
  },
  transactionAmount: {
    color: colors.ink,
    fontWeight: "900"
  }
});
