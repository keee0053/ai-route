# Expo integration status

This branch keeps the existing Cloudflare Workers backend and adds the Expo app
under mobile/.

The agreed request, response, units, null handling, and errors for the planned
route-generation endpoint are documented in `docs/API_CONTRACT.md`.

## What works in this branch

1. Receive or use a Google Maps route URL.
2. Resolve its origin and destination in the Expo app.
3. Call the deployed ekz-server endpoints without putting API keys in the app.
4. Search real candidates through POST /search.
5. Select candidates through POST /next.
6. Load tags and photos through POST /tag and GET /photo.
7. Show the candidates in the Expo result UI.
8. Open Google Maps with the selected candidates as waypoints.
9. Preserve input and offer the appropriate retry or review action when route
   loading fails.

The default API origin is:

    https://ekz-server.prizmprograms.workers.dev

Override it for development with EXPO_PUBLIC_API_URL.

## Deliberately left for team integration

- Add a server-side POST /generate-route orchestration endpoint.
- Compute an exact route containing all selected waypoints.
- Add POST /edit-route for replacement and deletion recalculation.
- Replace the temporary client-side duration estimate.
- Implement the preference-to-genre mapping and candidate ranking behind the
  agreed API contract.
- Verify Google Maps sharing on both Android and iOS.
- Decide whether to archive the Kotlin Android UI.

## Run the Expo app

From the repository root:

    npm install
    npm run mobile

No Google, Gemini, or TypeSafe API key belongs in mobile/. Those secrets remain
in the Cloudflare Workers environment.
