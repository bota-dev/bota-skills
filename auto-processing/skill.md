# Skill: Auto-Processing

## When to use

Use to inspect or explicitly configure best-effort transcription after verified
audio becomes available and optional summary after successful transcription.
Configuration is intent, not proof of provider admission, job creation,
enqueue success or completed output.

## Authority and configuration

Supply a server project key through `BOTA_API_KEY`. Restricted keys need
`config:read` for inspection and `config:write` for changes. Provider management
and processing jobs have their own scopes/admission rules. Keep credentials
out of URLs, logs, client bundles and model context. Loading this guide does
not authorize configuration writes or paid jobs.

Inspect effective configuration before changes; retain previous values and
target level. Settings deep-merge through organization → project → end user →
device. Only supplied properties override broader intent.

| Level | Processing section |
| --- | --- |
| Authenticated project | `/v1/config/processing` |
| End user | `/v1/end-users/{id}/config/processing` |
| Device | `/v1/devices/{id}/config/processing` |

Use GET to inspect and PUT for an explicit change. There is no
`/v1/projects/config/processing`. The section uses nested objects:

```json
{
  "auto_transcription": { "enabled": true },
  "auto_summary": { "enabled": true, "template": "general_notes" }
}
```

Optional `provider` is inside its corresponding object. Select a configured
ASR/LLM provider and existing template name. Flat booleans and
`summary_template_id` are not this schema. Never put provider keys in config;
use Platform or supported secure integration input with explicit authority.

## Inspect first, then apply an authorized patch

GET and PUT are deliberately separate; no write runs on import/startup, and
no failed mutation is automatically replayed. Choose the target and patch first.

```javascript
const api = 'https://api.bota.dev/v1';
const key = process.env.BOTA_API_KEY;
if (!key) throw new Error('BOTA_API_KEY is required');

async function processingRequest(method, patch) {
  const response = await fetch(api + '/config/processing', {
    method, redirect: 'error', credentials: 'omit',
    signal: AbortSignal.timeout(30_000),
    headers: { Authorization: `Bearer ${key}`, ...(method === 'PUT' ? { 'Content-Type': 'application/json' } : {}) },
    ...(method === 'PUT' ? { body: JSON.stringify(patch) } : {}),
  });
  if (!response.ok) throw new Error(`Processing configuration failed (${response.status})`);
  return response.json();
}

async function inspectProjectProcessing() {
  return processingRequest('GET');
}
async function applyAuthorizedProjectProcessing(patch) {
  return processingRequest('PUT', patch);
}
```

After a lost PUT response, GET current state and compare with saved intent.
Do not blindly reapply a stale patch over another administrator's update.
Returned configuration does not prove a job ran.

## Follow actual resources

1. Complete audio through its owning verification protocol. Pending verification
   or integrity failure cannot be bypassed to initiate processing.
2. If enabled, Bota attempts provider-route authorization, transcription creation
   and enqueue. Failure is logged without rolling back an already completed
   upload. No guaranteed transactional outbox retry is promised.
3. Successful transcription resolves auto-summary configuration again; a later
   change can affect the provider/template.
4. Inspect supported resource GETs and signed webhooks for actual job state.
   If absent, investigate config/provider/credential admission before explicitly
   requesting a manual job. Never automatically duplicate paid jobs.

An enabled project credential is selected for its provider; otherwise an
available built-in credential may apply. The selected route must satisfy
active compliance modes. Failure does not automatically switch providers.
Review AI output appropriately for clinical/legal decisions.

Manual `POST /v1/transcriptions` and `POST /v1/summaries` are separate explicit
operations. The API SDK supports reading these resources, not job creation or
configuration writes. Do not invent `bota.config` or processing-create methods.

## Contract references

- [Pinned processing schema/merge policy](https://github.com/bota-dev/bota/blob/2c388b098d4e0d8a4d3893018fed47a870305795/api/src/config-schema/definitions/processing.ts)
- [Pinned project config routes/scopes](https://github.com/bota-dev/bota/blob/2c388b098d4e0d8a4d3893018fed47a870305795/api/src/routes/v1/config/index.ts)
- [Processing and failure boundaries](https://docs.bota.dev/guides/auto-processing)
- [Webhook verification](../webhook-handling/skill.md)
- [API SDK cohort](https://github.com/bota-dev/api-sdk/blob/3546bc71da16885f664aaa7d057e5baddc0ba13b/packages/typescript/README.md)

These source contracts do not qualify deployed provider credentials, regulated
routes, a processing pipeline or a completed job.
