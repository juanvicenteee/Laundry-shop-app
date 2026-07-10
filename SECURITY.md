# Security Notes

## Mobile app controls

- Tokens must be stored with `expo-secure-store`; never use plain AsyncStorage for secrets.
- Avoid logging personal data, addresses, phone numbers, access tokens, or payment details.
- Validate user input locally for fast feedback, then validate again on the server.
- Ask for location only when the user is booking or tracking a pickup.
- Use app config and environment variables for public runtime settings only. Secret keys belong on the server.

## Backend controls required before production

- Use short-lived access tokens and refresh-token rotation.
- Protect customer, shop, and rider APIs with role-based authorization.
- Validate prices, discounts, delivery fees, shop availability, and service zones on the server.
- Add rate limits to login, booking creation, promo redemption, and payment initiation.
- Verify payment completion using provider webhooks before marking an order paid.
- Encrypt sensitive database fields where appropriate and keep audit logs for order state changes.
- Add fraud checks for repeated cancellations, fake GPS jumps, and abnormal promo usage.

## Store submission checks

- Confirm iOS and Android location permission copy is accurate.
- Remove demo API URLs, test payment keys, and debug builds.
- Rotate any credential that may have been shared during development.
