# Laundry Go

Laundry Go is a Grab-style mobile app starter for laundry pickup and delivery on Android and iOS. It is built with Expo React Native and TypeScript.

## Core flows

- Customer booking for pickup, laundry service, schedule, and delivery address.
- Nearby laundry shop discovery with ETA, rating, price, and service tags.
- Live order tracking UI for pickup, washing, quality check, delivery, and completion.
- Wallet and payment status surface.
- Shop and rider operations screen for accepting work and managing handoffs.

## Run locally

1. Install Node.js 18+ and pnpm.
2. Run `pnpm install`.
3. Run `pnpm start`.
4. Open in Expo Go or an emulator with `pnpm android` or `pnpm ios`.

## Security baseline

- Do not commit `.env` files, signing keys, certificates, or production API credentials.
- Store auth tokens only in `expo-secure-store`.
- Validate booking input before sending it to an API.
- Use HTTPS for backend traffic.
- Keep location permission scoped to active booking and tracking screens.
- Enforce authentication, authorization, rate limiting, and server-side price validation in the backend.

## Next production steps

- Replace demo data with authenticated API endpoints.
- Add payment provider SDK integration and webhook-backed payment verification.
- Add push notifications for rider assignment, pickup arrival, and delivery completion.
- Add role-based accounts for customers, shops, riders, and administrators.
- Add unit, integration, and end-to-end tests before store submission.
