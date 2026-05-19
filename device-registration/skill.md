# Skill: Device Registration

## Purpose

Register a Bota wearable device in your project and bind it to an end user so the device can capture and upload recordings.

## When to Use

- User pairs a new device via your mobile app for the first time
- Reassigning a device from one user to another
- Provisioning a fleet of devices for enterprise deployment

## Prerequisites

- A Bota secret key (`sk_live_*` or `sk_test_*`) — server-side only, never in mobile apps
- The device's **serial number** (printed on the device, readable via Bluetooth during pairing)
- An end user already created in your project (see `POST /v1/end-users`)

## How It Works

```
Device (BLE pairing)
  → Mobile App (reads serial number)
    → Your Backend (calls Bota API with sk_live_*)
      → POST /v1/devices          (register)
      → POST /v1/devices/:id/bind (bind to end user → returns dtok_*)
    → Mobile App (receives dtok_*)
  → Device (stores dtok_* via BLE)
```

The `dtok_*` (device token) is provisioned onto the device and used for all future direct uploads. It is returned **only once** — store it on the device immediately.

## Implementation

### Step 1 — Create the End User (if not already done)

```bash
curl -X POST https://api.bota.dev/v1/end-users \
  -H "Authorization: Bearer sk_live_..." \
  -H "Content-Type: application/json" \
  -d '{
    "external_id": "your-db-user-id-123",
    "display_name": "Jane Smith"
  }'
```

```json
{
  "id": "eu_01HXYZ...",
  "external_id": "your-db-user-id-123",
  "display_name": "Jane Smith",
  "created_at": "2025-01-15T10:00:00Z"
}
```

Save `eu_01HXYZ...` — you'll use it in the bind call.

### Step 2 — Register the Device

```bash
curl -X POST https://api.bota.dev/v1/devices \
  -H "Authorization: Bearer sk_live_..." \
  -H "Content-Type: application/json" \
  -d '{
    "serial_number": "PIN-2024-001234",
    "external_id": "your-device-id-456"
  }'
```

```json
{
  "id": "dev_01HABC...",
  "serial_number": "PIN-2024-001234",
  "external_id": "your-device-id-456",
  "status": "registered",
  "created_at": "2025-01-15T10:01:00Z"
}
```

### Step 3 — Bind the Device to the End User

```bash
curl -X POST https://api.bota.dev/v1/devices/dev_01HABC.../bind \
  -H "Authorization: Bearer sk_live_..." \
  -H "Content-Type: application/json" \
  -d '{
    "end_user_id": "eu_01HXYZ..."
  }'
```

```json
{
  "id": "dev_01HABC...",
  "end_user_id": "eu_01HXYZ...",
  "status": "bound",
  "device_token": "dtok_abc123...",
  "bound_at": "2025-01-15T10:02:00Z"
}
```

**The `device_token` is shown only once.** Send it to your mobile app, which provisions it onto the device via Bluetooth.

### TypeScript (Express backend)

```typescript
import Bota from "@bota.dev/node";

const bota = new Bota({ apiKey: process.env.BOTA_API_KEY! });

// Called from your mobile app during BLE pairing
app.post("/api/devices/register", async (req, res) => {
  const { serialNumber, userId } = req.body;

  // Look up or create end user
  const endUser = await bota.endUsers.getByExternalId(userId)
    ?? await bota.endUsers.create({ external_id: userId });

  // Register device
  const device = await bota.devices.create({
    serial_number: serialNumber,
    external_id: `device-${serialNumber}`,
  });

  // Bind to end user → returns dtok_*
  const bound = await bota.devices.bind(device.id, {
    end_user_id: endUser.id,
  });

  // Return token to mobile app for BLE provisioning
  res.json({
    device_id: bound.id,
    device_token: bound.device_token, // provision this onto the device
  });
});
```

### Device Reassignment

When reassigning a device to a different user:

```bash
# 1. Unbind from current user (rotates the device token)
curl -X POST https://api.bota.dev/v1/devices/dev_01HABC.../unbind \
  -H "Authorization: Bearer sk_live_..."

# 2. Bind to new user
curl -X POST https://api.bota.dev/v1/devices/dev_01HABC.../bind \
  -H "Authorization: Bearer sk_live_..." \
  -H "Content-Type: application/json" \
  -d '{ "end_user_id": "eu_01HNEW..." }'
```

Unbind rotates the token, so the old `dtok_*` stops working immediately. The new bind returns a fresh token to provision onto the device.

## Gotchas

**`device_token` shown only once** — If you lose it, unbind and rebind to generate a new one. There is no way to retrieve the existing token.

**`external_id` is optional but strongly recommended** — Map your user/device IDs to Bota IDs so you never need to store both and can look up resources without a Bota-specific ID.

**Idempotent registration** — Use the `Idempotency-Key` header if your mobile app might retry:
```bash
-H "Idempotency-Key: register-PIN-2024-001234"
```

**Device tokens have limited scope** — A `dtok_*` can only create recordings, get upload URLs, and report device status. It cannot list end users, manage webhooks, or access other devices.

**BLE-only devices don't need a `dtok_*`** — Bota Pin (BLE-only) uploads via your mobile app using an upload token (`up_*`). The `dtok_*` is for 4G-enabled devices that upload directly without a phone.

## Reference

- [Register Device](https://docs.bota.dev/api-reference/devices/create)
- [Bind Device](https://docs.bota.dev/api-reference/devices/bind)
- [Unbind Device](https://docs.bota.dev/api-reference/devices/unbind)
- [Device Management Guide](https://docs.bota.dev/guides/device-management)
- [Authentication — Device Tokens](https://docs.bota.dev/authentication#device-tokens)
