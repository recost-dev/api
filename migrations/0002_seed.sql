-- Seed: demo-commerce-app with pre-computed analysis results
-- Run once: npm run db:migrate:local (or db:migrate:remote for production)

INSERT OR IGNORE INTO projects (id, name, description, created_at, updated_at, latest_scan_id)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'demo-commerce-app',
  'Seeded project for immediate API exploration.',
  '2024-01-01T00:00:00.000Z',
  '2024-01-01T00:00:00.000Z',
  '00000000-0000-0000-0000-000000000002'
);

INSERT OR IGNORE INTO scans (id, project_id, created_at, endpoint_ids, suggestion_ids, graph, summary)
VALUES (
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000001',
  '2024-01-01T00:00:00.000Z',
  '["00000000-0000-0000-0000-000000000003","00000000-0000-0000-0000-000000000004","00000000-0000-0000-0000-000000000005","00000000-0000-0000-0000-000000000006","00000000-0000-0000-0000-000000000007"]',
  '["00000000-0000-0000-0000-000000000008","00000000-0000-0000-0000-000000000009","00000000-0000-0000-0000-000000000010"]',
  '{"nodes":[{"id":"00000000-0000-0000-0000-000000000003","label":"GET /api/users/:id","provider":"internal","monthlyCost":3,"callsPerDay":1000,"status":"n_plus_one_risk","group":"internal"},{"id":"00000000-0000-0000-0000-000000000004","label":"GET /api/users/:id/preferences","provider":"internal","monthlyCost":3,"callsPerDay":1000,"status":"n_plus_one_risk","group":"internal"},{"id":"00000000-0000-0000-0000-000000000005","label":"POST https://api.stripe.com/v1/payment_intents","provider":"stripe","monthlyCost":75,"callsPerDay":250,"status":"normal","group":"stripe"},{"id":"00000000-0000-0000-0000-000000000006","label":"POST https://api.sendgrid.com/v3/mail/send","provider":"sendgrid","monthlyCost":15,"callsPerDay":500,"status":"normal","group":"sendgrid"},{"id":"00000000-0000-0000-0000-000000000007","label":"POST https://api.openai.com/v1/responses","provider":"openai","monthlyCost":54,"callsPerDay":300,"status":"normal","group":"openai"}],"edges":[{"source":"src/checkout.ts","target":"00000000-0000-0000-0000-000000000003","line":47},{"source":"src/checkout.ts","target":"00000000-0000-0000-0000-000000000004","line":52},{"source":"src/payments/stripe.ts","target":"00000000-0000-0000-0000-000000000005","line":18},{"source":"src/notifications/email.ts","target":"00000000-0000-0000-0000-000000000006","line":34},{"source":"src/ai/assistant.ts","target":"00000000-0000-0000-0000-000000000007","line":26}]}',
  '{"totalEndpoints":5,"totalCallsPerDay":3050,"totalMonthlyCost":150,"highRiskCount":2}'
);

INSERT OR IGNORE INTO endpoints (id, project_id, scan_id, provider, method, url, files, call_sites, calls_per_day, monthly_cost, status)
VALUES
  (
    '00000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000002',
    'internal', 'GET', '/api/users/:id',
    '["src/checkout.ts"]',
    '[{"file":"src/checkout.ts","line":47,"library":"axios","frequency":"per-request"}]',
    1000, 3, 'n_plus_one_risk'
  ),
  (
    '00000000-0000-0000-0000-000000000004',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000002',
    'internal', 'GET', '/api/users/:id/preferences',
    '["src/checkout.ts"]',
    '[{"file":"src/checkout.ts","line":52,"library":"axios","frequency":"per-request"}]',
    1000, 3, 'n_plus_one_risk'
  ),
  (
    '00000000-0000-0000-0000-000000000005',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000002',
    'stripe', 'POST', 'https://api.stripe.com/v1/payment_intents',
    '["src/payments/stripe.ts"]',
    '[{"file":"src/payments/stripe.ts","line":18,"library":"fetch","frequency":"250/day"}]',
    250, 75, 'normal'
  ),
  (
    '00000000-0000-0000-0000-000000000006',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000002',
    'sendgrid', 'POST', 'https://api.sendgrid.com/v3/mail/send',
    '["src/notifications/email.ts"]',
    '[{"file":"src/notifications/email.ts","line":34,"library":"axios","frequency":"500/day"}]',
    500, 15, 'normal'
  ),
  (
    '00000000-0000-0000-0000-000000000007',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000002',
    'openai', 'POST', 'https://api.openai.com/v1/responses',
    '["src/ai/assistant.ts"]',
    '[{"file":"src/ai/assistant.ts","line":26,"library":"fetch","frequency":"per-session"}]',
    300, 54, 'normal'
  );

INSERT OR IGNORE INTO suggestions (id, project_id, scan_id, type, severity, affected_endpoints, affected_files, estimated_monthly_savings, description, code_fix)
VALUES
  (
    '00000000-0000-0000-0000-000000000008',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000002',
    'n_plus_one', 'high',
    '["00000000-0000-0000-0000-000000000003"]',
    '["src/checkout.ts"]',
    1.2,
    'Endpoint /api/users/:id has very high daily frequency and may be inside a loop.',
    'Refactor to prefetch or aggregate data before iteration.'
  ),
  (
    '00000000-0000-0000-0000-000000000009',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000002',
    'n_plus_one', 'high',
    '["00000000-0000-0000-0000-000000000004"]',
    '["src/checkout.ts"]',
    1.2,
    'Endpoint /api/users/:id/preferences has very high daily frequency and may be inside a loop.',
    'Refactor to prefetch or aggregate data before iteration.'
  ),
  (
    '00000000-0000-0000-0000-000000000010',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000002',
    'batch', 'medium',
    '["00000000-0000-0000-0000-000000000003","00000000-0000-0000-0000-000000000004"]',
    '["src/checkout.ts"]',
    1.5,
    'Related API calls in src/checkout.ts at nearby lines can likely be batched.',
    'Introduce a bulk endpoint or combine requests with server-side aggregation.'
  );
