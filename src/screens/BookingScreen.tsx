import { Ionicons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { AppScreen } from "../components/AppScreen";
import { Chip } from "../components/Chip";
import { SectionTitle } from "../components/SectionTitle";
import { serviceOptions, shops, timeWindows } from "../data/demo";
import { colors, shadows, spacing } from "../theme";
import { bookingSchema } from "../validation/booking";

export function BookingScreen() {
  const [service, setService] = useState(serviceOptions[0] ?? "");
  const [pickupWindow, setPickupWindow] = useState(timeWindows[0] ?? "");
  const [estimatedKg, setEstimatedKg] = useState(5);
  const [address, setAddress] = useState("Bonifacio High Street, Taguig");
  const [notes, setNotes] = useState("");
  const selectedShop = shops.find((shop) => shop.open) ?? shops[0];

  const estimate = useMemo(() => {
    const base = selectedShop?.basePrice ?? 0;
    const weightFee = Math.max(0, estimatedKg - 3) * 28;
    const deliveryFee = 49;
    return base + weightFee + deliveryFee;
  }, [estimatedKg, selectedShop?.basePrice]);

  function submitBooking() {
    const parsed = bookingSchema.safeParse({
      service,
      pickupWindow,
      address,
      notes,
      estimatedKg
    });

    if (!parsed.success) {
      Alert.alert("Check booking", parsed.error.issues[0]?.message ?? "Please check your details.");
      return;
    }

    Alert.alert("Booking ready", "This demo booking passed validation and is ready for the API.");
  }

  return (
    <AppScreen>
      <Text style={styles.heading}>Book laundry pickup</Text>
      <Text style={styles.subheading}>Choose the service, pickup time, and shop before confirming.</Text>

      <SectionTitle title="Service" />
      <View style={styles.wrap}>
        {serviceOptions.map((option) => (
          <Chip
            key={option}
            label={option}
            selected={option === service}
            onPress={() => setService(option)}
          />
        ))}
      </View>

      <SectionTitle title="Pickup time" />
      <View style={styles.wrap}>
        {timeWindows.map((window) => (
          <Chip
            key={window}
            label={window}
            selected={window === pickupWindow}
            onPress={() => setPickupWindow(window)}
          />
        ))}
      </View>

      <SectionTitle title="Pickup details" />
      <View style={[styles.formCard, shadows.card]}>
        <Text style={styles.label}>Address</Text>
        <TextInput
          value={address}
          onChangeText={setAddress}
          style={styles.input}
          placeholder="Building, street, city"
          maxLength={180}
          autoCapitalize="words"
          textContentType="fullStreetAddress"
        />
        <Text style={styles.label}>Estimated weight</Text>
        <View style={styles.stepper}>
          <Pressable style={styles.stepButton} onPress={() => setEstimatedKg((value) => Math.max(1, value - 1))}>
            <Ionicons name="remove" size={18} color={colors.ink} />
          </Pressable>
          <Text style={styles.kg}>{estimatedKg} kg</Text>
          <Pressable style={styles.stepButton} onPress={() => setEstimatedKg((value) => Math.min(30, value + 1))}>
            <Ionicons name="add" size={18} color={colors.ink} />
          </Pressable>
        </View>
        <Text style={styles.label}>Notes</Text>
        <TextInput
          value={notes}
          onChangeText={setNotes}
          style={[styles.input, styles.notes]}
          placeholder="Gate code, fabric care, stain notes"
          maxLength={240}
          multiline
        />
      </View>

      <SectionTitle title="Selected shop" />
      <View style={[styles.summary, shadows.card]}>
        <Text style={styles.shopName}>{selectedShop?.name}</Text>
        <Text style={styles.summaryText}>{selectedShop?.etaMinutes} min pickup estimate</Text>
        <View style={styles.priceRow}>
          <Text style={styles.priceLabel}>Estimated total</Text>
          <Text style={styles.price}>₱{estimate}</Text>
        </View>
        <Pressable style={styles.cta} onPress={submitBooking}>
          <Ionicons name="shield-checkmark" size={20} color="#FFFFFF" />
          <Text style={styles.ctaText}>Validate and book</Text>
        </Pressable>
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
  wrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  formCard: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: spacing.lg
  },
  label: {
    color: colors.ink,
    fontWeight: "800",
    marginBottom: spacing.sm,
    marginTop: spacing.md
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    color: colors.ink,
    backgroundColor: "#FBFCFA"
  },
  notes: {
    minHeight: 82,
    paddingTop: spacing.md,
    textAlignVertical: "top"
  },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md
  },
  stepButton: {
    width: 42,
    height: 42,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accentSoft
  },
  kg: {
    minWidth: 68,
    textAlign: "center",
    color: colors.ink,
    fontSize: 18,
    fontWeight: "900"
  },
  summary: {
    borderRadius: 8,
    padding: spacing.lg,
    backgroundColor: colors.surface
  },
  shopName: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: "900"
  },
  summaryText: {
    color: colors.muted,
    marginTop: spacing.xs
  },
  priceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: spacing.lg
  },
  priceLabel: {
    color: colors.muted,
    fontWeight: "700"
  },
  price: {
    color: colors.ink,
    fontSize: 24,
    fontWeight: "900"
  },
  cta: {
    height: 52,
    marginTop: spacing.lg,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.primary
  },
  ctaText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "900"
  }
});
