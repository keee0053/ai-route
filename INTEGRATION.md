# Expo integration status

This branch keeps the existing Cloudflare Workers backend and adds the Expo app
under mobile/.

The agreed request, response, units, null handling, and errors for the planned
route-generation endpoint are documented in `docs/API_CONTRACT.md`.

## What works in this branch

1. Receive or use a Google Maps route URL.
2. Resolve its origin and destination in the Expo app.
3. Call the backend without putting API keys in the app.
4. Generate a route through POST /generate-route using real Places candidates.
5. Compute exact duration and distance with all selected waypoints.
6. Replace or delete a waypoint through POST /edit-route and recalculate it.
7. Continue route generation without TypeSafe when its key or service is unavailable.
8. Load Gemini tags and proxied Google Places photos.
9. Open Google Maps with the selected candidates as waypoints.
10. Preserve input and offer the appropriate retry or review action when route
   loading fails.

The default API origin is:

    https://ekz-server.prizmprograms.workers.dev

Override it for development with EXPO_PUBLIC_API_URL.

## Deliberately left for team integration

- Deploy the new endpoints to the shared Cloudflare Workers environment.
- Run end-to-end checks against the team's Google and Gemini credentials.
- Verify Google Maps sharing on both Android and iOS.
- Decide whether to archive the Kotlin Android UI.

## Run the Expo app

From the repository root:

    npm install
    npm run mobile

No Google, Gemini, or TypeSafe API key belongs in mobile/. Those secrets remain
in the Cloudflare Workers environment.
