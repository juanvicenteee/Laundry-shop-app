import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { AppScreen } from "../components/AppScreen";
import { Chip } from "../components/Chip";
import { SectionTitle } from "../components/SectionTitle";
import {
  defaultDeliveryOption,
  defaultLaundryType,
  defaultPaymentMethod,
  deliveryOptions,
  laundryTypes,
  paymentMethods,
  pricePerLoad,
  timeWindows
} from "../data/demo";
import { submitBookingRequest } from "../lib/bookingApi";
import { colors, shadows, spacing } from "../theme";
import type { DeliveryOptionId, LaundryTypeId, PaymentMethod } from "../types";
import { bookingSchema } from "../validation/booking";

export function BookingScreen() {
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [laundryType, setLaundryType] = useState<LaundryTypeId>(defaultLaundryType.id);
  const [quantity, setQuantity] = useState(defaultLaundryType.capacity);
  const [delivery, setDelivery] = useState<DeliveryOptionId>("none");
  const [pickupWindow, setPickupWindow] = useState(timeWindows[0] ?? "");
  const [address, setAddress] = useState("");
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(defaultPaymentMethod);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const selectedType = laundryTypes.find((type) => type.id === laundryType) ?? defaultLaundryType;
  const selectedDelivery = deliveryOptions.find((option) => option.id === delivery) ?? defaultDeliveryOption;
  const loads = Math.max(1, Math.ceil(quantity / selectedType.capacity));

  const estimate = useMemo(() => loads * pricePerLoad + selectedDelivery.fee, [loads, selectedDelivery]);

  async function submitBooking() {
    const parsed = bookingSchema.safeParse({
      customerName,
      phone,
      laundryType,
      quantity,
      delivery,
      address,
      pickupWindow,
      paymentMethod,
      notes
    });

    if (!parsed.success) {
      Alert.alert("Check booking", parsed.error.issues[0]?.message ?? "Please check your details.");
      return;
    }

    setSubmitting(true);
    try {
      const result = await submitBookingRequest({
        customerName,
        phone,
        laundryType,
        quantity,
        delivery,
        address,
        pickupWindow,
        paymentMethod,
        notes,
        coords,
        quotedTotal: estimate
      });

      Alert.alert(
        `Booking ${result.request_no}`,
        `Bubbly-fi received your request. Total: PHP ${result.total}. We'll text you a confirmation shortly.`
      );
    } catch (error) {
      Alert.alert("Couldn't submit booking", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function useCurrentLocation() {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Location permission needed", "Allow location access to auto-fill your delivery address.");
        return;
      }

      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setCoords({ latitude: position.coords.latitude, longitude: position.coords.longitude });

      const [place] = await Location.reverseGeocodeAsync(position.coords);
      if (place) {
        const parts = [place.name, place.street, place.district, place.city].filter(Boolean);
        if (parts.length) setAddress(parts.join(", "));
      }
    } catch {
      Alert.alert("Couldn't get location", "Enter your delivery address manually.");
    } finally {
      setLocating(false);
    }
  }

  return (
    <AppScreen>
      <Text style={styles.heading}>Book laundry</Text>
      <Text style={styles.subheading}>Choose a laundry type, time, and delivery option.</Text>

      <SectionTitle title="Your details" />
      <View style={[styles.formCard, shadows.card]}>
        <Text style={styles.label}>Full name</Text>
        <TextInput
          value={customerName}
          onChangeText={setCustomerName}
          style={styles.input}
          placeholder="Juan Dela Cruz"
          maxLength={80}
          autoCapitalize="words"
          textContentType="name"
        />
        <Text style={styles.label}>Mobile number</Text>
        <TextInput
          value={phone}
          onChangeText={setPhone}
          style={styles.input}
          placeholder="09XX XXX XXXX"
          maxLength={20}
          keyboardType="phone-pad"
          textContentType="telephoneNumber"
        />
      </View>

      <SectionTitle title="Laundry type" />
      <View style={styles.wrap}>
        {laundryTypes.map((type) => (
          <Chip
            key={type.id}
            label={type.label}
            selected={type.id === laundryType}
            onPress={() => {
              setLaundryType(type.id);
              setQuantity(type.capacity);
            }}
          />
        ))}
      </View>

      <SectionTitle title="Drop-off / pickup time" />
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

      <SectionTitle title="Delivery" />
      <View style={styles.wrap}>
        {deliveryOptions.map((option) => (
          <Chip
            key={option.id}
            label={option.fee ? `${option.label} (₱${option.fee})` : option.label}
            selected={option.id === delivery}
            onPress={() => setDelivery(option.id)}
          />
        ))}
      </View>

      {delivery !== "none" ? (
        <>
          <SectionTitle title="Delivery address" />
          <View style={[styles.formCard, shadows.card]}>
            <TextInput
              value={address}
              onChangeText={(value) => {
                setAddress(value);
                setCoords(null);
              }}
              style={styles.input}
              placeholder="Building, street, city"
              maxLength={180}
              autoCapitalize="words"
              textContentType="fullStreetAddress"
            />
            <Pressable style={styles.locateButton} onPress={useCurrentLocation} disabled={locating}>
              {locating ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Ionicons name="locate" size={16} color={colors.primary} />
              )}
              <Text style={styles.locateText}>{locating ? "Locating..." : "Use my current location"}</Text>
            </Pressable>
            {coords ? <Text style={styles.locateHint}>Pinned via GPS for the rider.</Text> : null}
          </View>
        </>
      ) : null}

      <SectionTitle title="Quantity" />
      <View style={[styles.formCard, shadows.card]}>
        <Text style={styles.label}>
          {selectedType.label} ({selectedType.unit})
        </Text>
        <View style={styles.stepper}>
          <Pressable style={styles.stepButton} onPress={() => setQuantity((value) => Math.max(1, value - 1))}>
            <Ionicons name="remove" size={18} color={colors.ink} />
          </Pressable>
          <Text style={styles.kg}>
            {quantity} {selectedType.unit}
          </Text>
          <Pressable style={styles.stepButton} onPress={() => setQuantity((value) => Math.min(30, value + 1))}>
            <Ionicons name="add" size={18} color={colors.ink} />
          </Pressable>
        </View>
        <Text style={styles.label}>Notes</Text>
        <TextInput
          value={notes}
          onChangeText={setNotes}
          style={[styles.input, styles.notes]}
          placeholder="Fabric care, stain notes"
          maxLength={240}
          multiline
        />
      </View>

      <SectionTitle title="Payment method" />
      <View style={styles.wrap}>
        {paymentMethods.map((method) => (
          <Chip
            key={method}
            label={method}
            selected={method === paymentMethod}
            onPress={() => setPaymentMethod(method)}
          />
        ))}
      </View>
      <Text style={styles.paymentHint}>
        Online bookings with delivery are confirmed and settled via GCash. Counter drop-off can pay any method in
        person.
      </Text>

      <SectionTitle title="Summary" />
      <View style={[styles.summary, shadows.card]}>
        <Text style={styles.shopName}>{selectedType.label}</Text>
        <Text style={styles.summaryText}>
          {loads} load{loads === 1 ? "" : "s"} · ₱{pricePerLoad} each
        </Text>
        <View style={styles.priceRow}>
          <Text style={styles.priceLabel}>Estimated total</Text>
          <Text style={styles.price}>₱{estimate}</Text>
        </View>
        <Pressable style={styles.cta} onPress={submitBooking} disabled={submitting}>
          {submitting ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Ionicons name="shield-checkmark" size={20} color="#FFFFFF" />
          )}
          <Text style={styles.ctaText}>{submitting ? "Sending..." : "Validate and book"}</Text>
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
  locateButton: {
    minHeight: 40,
    marginTop: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs
  },
  locateText: {
    color: colors.primary,
    fontWeight: "800"
  },
  locateHint: {
    color: colors.muted,
    fontSize: 12,
    marginTop: spacing.xs
  },
  paymentHint: {
    color: colors.muted,
    fontSize: 12,
    marginTop: spacing.sm
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
