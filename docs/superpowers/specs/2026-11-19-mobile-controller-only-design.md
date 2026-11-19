# Mobile Controller Only — Design

## Intent
Phones may sign in and control an authorized desktop/Windows Agent as viewers. A phone must not become a screen-sharing Host or an enrolled control target.

## Goals and constraints
- Detect mobile browsers, including Android/iPhone/iPad and iPadOS Safari in desktop-UA mode.
- Hide browser-share actions and block direct mobile navigation to the Host page.
- Enforce the Host restriction at the server for browser registration, Agent enrollment, and Host WebSocket roles.
- Keep mobile viewer login, pairing requests, live viewing, and authorized input to desktop Agents available.
- Do not change Windows Agent consent, password authentication, production data, or desktop sharing behavior.

## Approaches
- UI-only blocking is easy to bypass with direct API calls, so it is insufficient.
- Server-only blocking protects the boundary but leaves confusing share controls on phones.
- Selected: layered browser detection plus server enforcement; mobile remains a viewer/controller.

## Implementation calls
Use User-Agent Client Hints, mobile User-Agent patterns, and the iPadOS MacIntel-plus-touch signature in the browser. Send an explicit mobile-class header from the browser so the server can also recognize iPad desktop-UA mode. The server independently checks that header and normal mobile request headers before allowing Host roles. This is a usability policy for normal clients, not a defense against a deliberately spoofed client.
