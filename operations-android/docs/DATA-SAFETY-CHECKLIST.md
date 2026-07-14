# Google Play Data safety checklist

This document is a preparation aid, not legal advice. Confirm the final answers against your live Supabase, SMS, email, analytics, and hosting configuration.

## Customer app data collected

- Name
- Philippine mobile number
- Complete pickup address and landmark
- Optional precise GPS coordinates
- Optional pickup-point and laundry-item photos
- GCash reference and payment-proof image
- Service selections, estimated weight, pickup schedule and notes

## Purpose

- Process and fulfill laundry pickup/delivery bookings
- Verify payment
- Contact the customer
- Prevent fraud and abuse
- Maintain business and audit records

## Security and retention

- Data is transmitted over HTTPS.
- Photos and payment proof should remain in private Supabase Storage buckets.
- Staff should access images only using short-lived signed URLs.
- Apply the retention rules already defined in the Supabase security migrations.
- Provide a public privacy-policy URL and a contact channel for correction/deletion requests.

## Staff app

The staff app processes authentication data, operational order data, customer records, payment status, inventory activity and audit information. Access is restricted to authorized Bubbly-fi personnel.
