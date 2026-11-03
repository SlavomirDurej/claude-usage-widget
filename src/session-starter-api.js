const { randomUUID } = require('crypto');

const MODELS = ['claude-haiku-4-5-20251001', 'claude-sonnet-4-6'];
const PROMPT = '1+1= Reply with only the answer. Do not use tools.';
const TRIGGERS = '/v1/code/triggers';

// Private Claude web APIs. Payloads checked against the web client on 2026-09-21.
// Keep these separate from scheduling so API changes cannot cause retry storms.
class SessionStarterAPI {
  constructor(request) { this.request = request; }

  async usage(org) {
    return this.request(org, `/api/organizations/${encodeURIComponent(org)}/usage`);
  }

  async ping(org, model, timezone) {
    const uuid = randomUUID();
    const base = `/api/organizations/${encodeURIComponent(org)}/chat_conversations`;
    await this.request(org, base, 'POST', {
      uuid, name: 'Widget session starter', model,
      is_temporary: true, include_conversation_preferences: true
    });
    // Never retry a completion: a timeout can occur after the server accepted it.
    return this.request(org, `${base}/${uuid}/completion`, 'POST', {
      // The chat API accepts a fixed locale enum; UK English is not supported.
      prompt: PROMPT, model, timezone, locale: 'en-US',
      max_tokens_to_sample: 16,
      parent_message_uuid: '00000000-0000-4000-8000-000000000000',
      attachments: [], files: [], sync_sources: [], tools: [],
      rendering_mode: 'messages'
    }, true);
  }

  async findRoutine(org, name) {
    let cursor;
    for (let page = 0; page < 50; page++) {
      const query = new URLSearchParams({ limit: '100' });
      if (cursor) query.set('cursor', cursor);
      const result = await this.request(org, `${TRIGGERS}?${query}`);
      if (!Array.isArray(result.data)) throw new Error('Unexpected cloud routine list response.');
      const matches = result.data.filter(item => item.name === name);
      if (matches.length > 1) throw new Error('Duplicate widget routines found. Manage them in Claude before continuing.');
      if (matches.length) return matches[0];
      if (!result.has_more && !result.next_cursor) return null;
      if (!result.next_cursor) throw new Error('Cloud routine pagination is unsupported.');
      cursor = result.next_cursor;
    }
    throw new Error('Too many cloud routines to inspect safely.');
  }

  async environment(org) {
    const base = `/v1/environment_providers/private/organizations/${encodeURIComponent(org)}`;
    const result = await this.request(org, `${base}/environments?limit=1000`);
    if (!Array.isArray(result.environments)) throw new Error('Unexpected cloud environment response.');
    const existing = result.environments.find(item => item.kind === 'anthropic_cloud' && !item.archived_at);
    if (existing) return existing.environment_id || existing.id;
    const created = await this.request(org, `${base}/cloud/create`, 'POST', {
      name: 'Widget session starter', kind: 'anthropic_cloud',
      description: 'Minimal environment for the usage widget session starter',
      config: {
        environment_type: 'anthropic', cwd: '/home/user', init_script: null,
        environment: {}, languages: [],
        network_config: { allowed_hosts: [], allow_default_hosts: false }
      }
    });
    const id = created.environment_id || created.id;
    if (!id) throw new Error('Cloud environment creation returned no ID.');
    return id;
  }

  body(name, config, environmentId, cron) {
    return {
      name, cron_expression: cron, enabled: false, mcp_connections: [],
      job_config: { ccr: {
        environment_id: environmentId,
        session_context: { model: config.model, sources: [], allowed_tools: [] },
        events: [{ data: {
          uuid: randomUUID(), session_id: '', type: 'user', parent_tool_use_id: null,
          message: { content: PROMPT, role: 'user' }
        } }]
      } }
    };
  }

  async create(org, body) {
    return this.unwrap(await this.request(org, TRIGGERS, 'POST', body));
  }
  async update(org, id, body) {
    return this.unwrap(await this.request(org, `${TRIGGERS}/${encodeURIComponent(id)}`, 'POST', body));
  }
  async get(org, id) {
    return this.unwrap(await this.request(org, `${TRIGGERS}/${encodeURIComponent(id)}`));
  }
  unwrap(result) {
    const routine = result?.trigger || result;
    if (!routine?.id) throw new Error('Cloud response did not contain a routine ID.');
    return routine;
  }
}

module.exports = { SessionStarterAPI, MODELS, PROMPT };
