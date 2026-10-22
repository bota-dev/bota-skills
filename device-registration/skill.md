# Skill: Device Registration

## When to use

Use for a customer backend registering a Bota device or preparing a new
device-confirmed BLE binding. Physical capture, transfer and cleanup belong
to the separate [App SDK](https://docs.bota.dev/api-reference/client-sdks).
Reading this recipe does not authorize registration or reassignment.

## Availability and trust prerequisites

This guide targets the **unreleased mandatory encrypted-delivery source** at
`d6969398`. Bind requires `credential_delivery: "hpke_v1"` for every device;
there is no plaintext fallback. Use a coordinated, explicitly qualified backend,
App SDK, app and firmware cohort. Published package pins alone do not establish
compatibility, and this guide does not authorize installation or cutover.

The backend requires migration 124, independently trusted serial-to-physical-key
enrollment, and matching signing/environment configuration. Manufacturing or
service administration supplies that trust; an API request, BLE public-key read
or old mutable device row cannot enroll it. Unsupported clients, absent/revoked
trust and mismatched keys must stop. Never repair this by restoring raw delivery.

## Authority and inputs

- Authenticate your application's user and resolve their Bota end-user ID on
  your server. An arbitrary request's end-user ID is not authorization.
- Supply `BOTA_API_KEY` from your server's secret manager/environment.
  Restricted keys need `end_users:write` for user creation and `devices:write`
  for registration/binding. Keep keys and provisional tokens out of URLs,
  logs, client bundles and model context.
- Read the exact serial/model through the supported device integration. Scan
  names/suffixes are not full serial identity. Register an explicit supported
  model: `bota_pin`, `bota_note` or `bota_pin_pro`.

## Backend sequence

1. Create or resolve the application user's end-user mapping. Creation accepts
   `external_id`, `name`, `email` and `metadata`; `display_name` is not the field.
   Save the returned `eu_*` ID. Reconcile an uncertain create by its saved
   external ID before deciding on another write.
2. Register using `serial_number` and required `model`. Save the returned
   `dev_*` ID alongside the serial. Device registration has no `external_id`
   field; a serial remains reserved after deletion.
3. Prepare binding with required `credential_delivery: "hpke_v1"`,
   `confirmation_mode: "device"`, the exact end-user ID and observed `pk_d` when
   available. `pk_d` is only a consistency check against independent trusted
   enrollment; it cannot enroll or replace a manufacturing key.
4. Retain the exact `binding_attempt_id`. The credential is returned only as
   `credential_envelope`, with
   `format: "bota-device-token-v1"`, `encoding: "base64url"` and canonical
   unpadded `data`. It contains no raw `device_token`. Reject plaintext, missing,
   malformed, mixed or obsolete string-in-token-field representations. Other
   device/attempt metadata may accompany it; never forward the whole response.
   Forward the envelope opaquely through the authenticated app/qualified SDK
   integration. Neither your server nor app decrypts it. Only firmware verifies
   signer, recipient, environment, purpose and binding before installing the
   decrypted token. The backend remains unbound until that succeeds.
5. After physical verification, POST `{}` to
   `/devices/{id}/bind/{bindingAttemptId}/confirm`. This commits binding and
   advances its generation. Repeating that exact confirmation after a lost
   success response is supported.
6. On known provisioning failure/cancellation, abort that exact attempt with
   `/devices/{id}/bind/{bindingAttemptId}/abort`. Unknown preparation or device
   outcomes need reconciliation; do not automatically unbind/rebind or replace
   an attempt. Abort does not undo an already confirmed binding.

Omitted/`immediate` confirmation retains its older binding-state behavior but
still requires encrypted delivery. New mobile/BLE integrations use device
confirmation. After device decryption/installation, `dtok_*` remains the raw
HTTPS Bearer credential for capability-enabled WiFi/cellular access, not a
developer/application-user login. Delivery encryption is separate from recording
encryption. A BLE connection does not establish radio capability.

Existing valid stored tokens are not automatically erased, re-enrolled or
rotated by this change. Device-only encrypted refresh/recovery is a separate
protocol; do not implement it as a developer CLI/SDK command or automatically
refresh during registration. Retired claim/serial-only provision routes cannot
restore credential issuance.

## Server HTTP example

This example prepares only; it performs no BLE provisioning or confirmation.
Persist intent and resolve unknown prior operations before calling it. Its
IDs/model must already belong to the authenticated application workflow.

```javascript
const api = 'https://api.bota.dev/v1'; // Change only for a trusted deployment.
const key = process.env.BOTA_API_KEY;
if (!key) throw new Error('BOTA_API_KEY is required');

async function post(path, body) {
  const response = await fetch(api + path, {
    method: 'POST', redirect: 'error', credentials: 'omit',
    signal: AbortSignal.timeout(30_000),
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Bota request failed (${response.status})`);
  return response.json();
}

async function registerAndPrepare({ serialNumber, model, endUserId, devicePublicKey }) {
  const device = await post('/devices', { serial_number: serialNumber, model });
  await saveDeviceMapping(serialNumber, device.id);
  const attempt = await post(`/devices/${encodeURIComponent(device.id)}/bind`, {
    end_user_id: endUserId, confirmation_mode: 'device', credential_delivery: 'hpke_v1',
    ...(devicePublicKey === undefined ? {} : { pk_d: devicePublicKey }),
  });
  if (Object.hasOwn(attempt, 'device_token') || !attempt.credential_envelope) {
    throw new Error('Encrypted credential delivery is required; reconcile the attempt');
  }
  await provisionExactAttempt(device.id, {
    binding_attempt_id: attempt.binding_attempt_id,
    credential_envelope: attempt.credential_envelope,
  });
}
```

`saveDeviceMapping` and `provisionExactAttempt` are application-owned durability
and secure provisioning integration points, not implemented here or invented
callable SDK methods. The provisioning hook must use the matching qualified
envelope parser/device path, reject invalid or mixed input, and wait for verified
physical installation. A presence check in this example is not cryptographic
verification. Never log the envelope or return the whole attempt to a model or
public endpoint. Separate explicit confirmation/abort from preparation; this
helper makes no automatic retry and cannot establish published SDK support.

GET `/devices?serial_number=...` can recover a known mapping, but absence alone
does not prove an earlier request stopped. Do not invent unconditional
`Idempotency-Key` replay guarantees or unbind/rebind merely because a token was
lost. The current API SDK has no device-create/bind methods.

## Contract references

- [Pinned device inputs](https://github.com/bota-dev/bota/blob/d69693982e48cb8b70f501387f11802bff2d42b0/api/src/routes/v1/devices/validation.ts)
- [Pinned trusted delivery service](https://github.com/bota-dev/bota/blob/d69693982e48cb8b70f501387f11802bff2d42b0/api/src/services/device-token-delivery.service.ts)
- [Owning encrypted-delivery review and release gates](https://github.com/bota-dev/bota/blob/d69693982e48cb8b70f501387f11802bff2d42b0/docs/reviews/device-token-envelope.md)
- [Register](https://docs.bota.dev/api-reference/devices/create), [prepare](https://docs.bota.dev/api-reference/devices/bind), [confirm](https://docs.bota.dev/api-reference/devices/confirm-binding), [abort](https://docs.bota.dev/api-reference/devices/abort-binding)
- [End-user creation](https://docs.bota.dev/api-reference/end-users/create)
- [API SDK cohort](https://github.com/bota-dev/api-sdk/blob/3546bc71da16885f664aaa7d057e5baddc0ba13b/packages/typescript/README.md)

Source contracts do not prove live deployment, physical provisioning or
package publication. Do not install the fictional `@bota.dev/node` package.
