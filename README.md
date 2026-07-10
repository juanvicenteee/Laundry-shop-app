# Bubbly-fi Laundry

Bubbly-fi Laundry is the customer-facing mobile app for Bubbly-fi Laundry Shop (92 14th Ave, Cubao, Quezon City), a single-shop laundry business with optional pickup/delivery. It is built with Expo React Native and TypeScript.

## Core flows

- Customer booking by laundry type (regular, blankets, comforter, bedsheets/towels), with load-based pricing and an optional delivery add-on.
- Order tracking through the shop's real workflow: Received, Washing, Drying, Ready, Claimed.
- Payment method selection (Cash, GCash, Maya, Bank Transfer) matching how the shop's own dashboard records payments.
- Internal work hub for shop staff to advance orders through the wash/dry/claim pipeline.

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
