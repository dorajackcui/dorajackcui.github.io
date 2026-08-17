import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://cxaoomvagqpuatlfthlx.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SERVICE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY is missing');
const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const providerRules = [
  ['Airbnb', /airbnb/i],
  ['Booking.com', /booking\.com|booking/i],
  ['Agoda', /agoda/i],
  ['Expedia', /expedia|vrbo/i],
  ['Trip.com', /trip\.com|ctrip/i],
];

function detectProvider(from = '', subject = '') {
  const hay = `${from} ${subject}`;
  for (const [name, re] of providerRules) if (re.test(hay)) return name;
  return null;
}
function clean(s = '') { return String(s).replace(/\s+/g, ' ').trim(); }
function money(text = '') {
  const m = text.match(/(?:JPY|¥|￥)\s*([\d,]+)/i) || text.match(/([\d,]+)\s*(?:円|JPY)/i);
  return m ? Number(m[1].replace(/,/g, '')) : null;
}
function dates(text = '') {
  const iso = [...text.matchAll(/(20\d{2})[\/.\-年](\d{1,2})[\/.\-月](\d{1,2})日?/g)]
    .map(m => `${m[1]}-${String(+m[2]).padStart(2,'0')}-${String(+m[3]).padStart(2,'0')}`);
  return [...new Set(iso)].slice(0, 2);
}
function reservationCode(text = '') {
  const patterns = [
    /(?:confirmation|reservation|予約|確認)(?:\s*(?:code|number|番号|コード))?\s*[:：#]?\s*([A-Z0-9-]{5,})/i,
    /\b([A-Z0-9]{8,14})\b/
  ];
  for (const p of patterns) { const m = text.match(p); if (m) return m[1]; }
  return null;
}
function classify(subject = '', body = '') {
  const t = `${subject} ${body}`.toLowerCase();
  if (/cancel|cancelled|キャンセル|取消/.test(t)) return 'reservation_cancelled';
  if (/変更|modified|updated|変更されました/.test(t)) return 'reservation_updated';
  if (/payout|支払|振込|payment|入金/.test(t)) return 'payout';
  if (/message|メッセージ|問い合わせ|inquiry|question/.test(t)) return 'guest_message';
  if (/予約|reservation|booking|confirmed|確定/.test(t)) return 'reservation';
  return 'unknown';
}
async function setSourceStatus(id, patch) {
  await sb.from('email_ingestion_sources').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
}

const { data: sources, error: sourceErr } = await sb
  .from('email_ingestion_sources')
  .select('id,organization_id,email_address,worker_slot,status,last_synced_at')
  .eq('provider', 'icloud')
  .eq('mode', 'imap')
  .neq('status', 'paused');
if (sourceErr) throw sourceErr;

for (const source of sources || []) {
  if (!source.worker_slot) continue;
  const password = process.env[`ICLOUD_${source.worker_slot}_APP_PASSWORD`];
  if (!password) {
    await setSourceStatus(source.id, { status: 'setup_required', last_error: `Missing ICLOUD_${source.worker_slot}_APP_PASSWORD` });
    continue;
  }

  const client = new ImapFlow({
    host: 'imap.mail.me.com',
    port: 993,
    secure: true,
    auth: { user: source.email_address, pass: password },
    logger: false,
  });

  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    try {
      const since = source.last_synced_at
        ? new Date(new Date(source.last_synced_at).getTime() - 48 * 3600 * 1000)
        : new Date(Date.now() - 14 * 86400 * 1000);
      const uids = await client.search({ since });
      let ingested = 0;
      for await (const msg of client.fetch(uids, { source: true, envelope: true, uid: true })) {
        const parsed = await simpleParser(msg.source);
        const from = parsed.from?.text || msg.envelope?.from?.map(x => x.address).join(', ') || '';
        const subject = clean(parsed.subject || msg.envelope?.subject || '');
        const provider = detectProvider(from, subject);
        if (!provider) continue;
        const body = clean(parsed.text || '');
        const all = `${subject}\n${body}`;
        const ds = dates(all);
        const externalMessageId = parsed.messageId || `${source.email_address}:${msg.uid}`;
        const payload = {
          organization_id: source.organization_id,
          source_id: source.id,
          provider,
          external_message_id: externalMessageId,
          sender: from || null,
          recipient: parsed.to?.text || source.email_address,
          subject: subject || null,
          sent_at: parsed.date?.toISOString?.() || null,
          message_type: classify(subject, body),
          reservation_code: reservationCode(all),
          check_in: ds[0] || null,
          check_out: ds[1] || null,
          gross_amount_yen: money(all),
          currency_code: /USD/i.test(all) ? 'USD' : 'JPY',
          body_text: body.slice(0, 20000) || null,
          parse_confidence: provider ? 0.45 : 0.1,
          raw_payload: { uid: msg.uid },
          updated_at: new Date().toISOString(),
        };
        const { error } = await sb.from('ota_email_messages').upsert(payload, {
          onConflict: 'organization_id,provider,external_message_id',
          ignoreDuplicates: false,
        });
        if (error) throw error;
        ingested++;
      }
      await setSourceStatus(source.id, { status: 'connected', last_synced_at: new Date().toISOString(), last_error: null });
      console.log(`${source.email_address}: ${ingested} OTA messages processed`);
    } finally {
      lock.release();
    }
    await client.logout();
  } catch (err) {
    console.error(`${source.email_address}:`, err.message);
    await setSourceStatus(source.id, { status: 'error', last_error: String(err.message).slice(0, 500) });
    try { await client.logout(); } catch {}
  }
}
