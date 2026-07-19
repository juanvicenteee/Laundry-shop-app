Bubbly-fi /customer notification diagnostics overlay

Files
- customer-notification-diagnostics.js

Apply to the current complete Netlify website
1. Copy customer-notification-diagnostics.js beside customer.html.
2. Add this line immediately before </body> in customer.html:
   <script src="customer-notification-diagnostics.js?v=1.0.0" data-cfasync="false"></script>
3. Deploy the complete website folder to Netlify.

Behavior
- The Test alerts button appears only inside Bubbly-fi Customer Android v1.6.14 or newer.
- Normal desktop/mobile browser visitors see no Android-only control.
- Booking, pricing, uploads, CAPTCHA and payment code are unchanged.
