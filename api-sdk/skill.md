# Skill: Bota API SDK

## When to use

Build a trusted server integration with the TypeScript or async Python **API SDK**.
Use the separate App SDK for physical-device/BLE workflows.

## Availability and supported surface

The [pinned source](https://github.com/bota-dev/api-sdk/tree/3546bc71da16885f664aaa7d057e5baddc0ba13b)
contains experimental `@bota.dev/api-sdk@0.1.0-beta.0` and `bota-api-sdk@0.1.0b0`
candidates. Source/package tests do not establish npm/PyPI publication. Check the
release and exact artifact before offering installation commands. The TypeScript
cohort targets Node 22.23.2/24.19.0; Python is async-only with its own runtime matrix.

Supported operations are credential identity and list/get for end users, devices,
recordings, transcriptions and summaries: eleven reads. A separate cohort adds
ordinary end-user create/update. Uploads, device provisioning, processing requests,
provider credentials, token issuance and Ask streaming are outside these cohorts.

## Read a project identity

With a qualified artifact already available in your server environment:

```typescript
import { BotaApiClient } from '@bota.dev/api-sdk';

const client = new BotaApiClient({ credentials: async () => {
  const key = process.env.BOTA_API_KEY;
  if (!key) throw new Error('BOTA_API_KEY is required');
  return key;
} });
const identity = await client.getAuthIdentity();
if (identity.status === 200) console.log(identity.data.project_id);
```

```python
import asyncio
import os
from bota_api_sdk import BotaApiClient

async def main():
    async with BotaApiClient({"credentials": os.environ["BOTA_API_KEY"]}) as client:
        identity = await client.get_auth_identity()
        if identity.data is not None:
            print(identity.data["project_id"])

asyncio.run(main())
```

Credentials are explicit caller input. Neither SDK reads CLI stores/profiles or
browser sessions. Keep keys on trusted servers and out of assistant context.
The default REST base is `https://api.bota.dev/v1`; custom deployment bases require
the documented origin checks. HTTP loopback needs an explicit development option.

## Choose the right operation

- TypeScript uses named `BotaApiClient`, not `@bota.dev/node` or a default fluent client.
  Detail calls use `{ path: { id } }`; bound pagination with `maxPages` and `maxItems`.
- `postEndUsers({ body })` and `patchEndUsersById({ path: { id }, body })` correspond
  to Python `post_end_users` and `patch_end_users_by_id`. PATCH replaces supplied
  metadata, leaves omitted fields unchanged and cannot change `external_id`.
- Writes make one transport attempt. After an unknown result, reconcile with an
  explicit read and your persisted external/Bota ID. Do not automatically replay
  creation or PATCH. Read retry settings do not make writes idempotent.
- Deadlines and cancellation withdraw local work; they do not prove remote rollback.
  Response models preserve wire values and do not validate full response schemas.

Use the pinned [TypeScript contract](https://github.com/bota-dev/api-sdk/blob/3546bc71da16885f664aaa7d057e5baddc0ba13b/packages/typescript/README.md)
and [Python contract](https://github.com/bota-dev/api-sdk/blob/3546bc71da16885f664aaa7d057e5baddc0ba13b/packages/python/README.md)
for method signatures, error/uncertainty types, retry eligibility and runtime limits.
