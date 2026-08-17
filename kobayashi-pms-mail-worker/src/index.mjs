import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://cxaoomvagqpuatlfthlx.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SERVICE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY is missing');
const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

function clean(s = '') { return String(s).replace(/\s+/g, ' ').trim(); }
function toIso(y, m, d) { return `${y}-${String(+m).padStart(2,'0')}-${String(+d).padStart(2,'0')}`; }
function tokyoToday() { return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()); }
function num(v) { if (v == null) return null; const n = Number(String(v).replace(/,/g,'').replace(/[^0-9.-]/g,'')); return Number.isFinite(n) ? Math.round(n) : null; }
function absNum(v) { const n = num(v); return n == null ? null : Math.abs(n); }
function firstMatch(text, patterns) { for (const p of patterns) { const m = text.match(p); if (m) return m; } return null; }
function firstGroup(text, patterns) { const m = firstMatch(text, patterns); return m?.[1]?.trim() || null; }

const months = {jan:1,january:1,feb:2,february:2,mar:3,march:3,apr:4,april:4,may:5,jun:6,june:6,jul:7,july:7,aug:8,august:8,sep:9,september:9,oct:10,october:10,nov:11,november:11,dec:12,december:12};
function englishDate(month, day, year) { const m = months[String(month).toLowerCase()]; return m ? toIso(year,m,day) : null; }

function detectProvider(from = '', subject = '') {
  const f = from.toLowerCase();
  if (/(@|\.)airbnb\.com\b/.test(f)) return 'Airbnb';
  if (/agoda-messaging\.com|agoda\.global|(@|\.)agoda\.com\b/.test(f)) return 'Agoda';
  if (/guest\.booking\.com|(@|\.)booking\.com\b/.test(f)) return 'Booking.com';
  if (/expedia|vrbo|homeaway/.test(f)) return 'Expedia';
  if (/trip\.com|ctrip/.test(f)) return 'Trip.com';
  const s = subject.toLowerCase();
  if (s.includes('airbnb')) return 'Airbnb';
  if (s.includes('agoda') || s.includes('アゴダ')) return 'Agoda';
  if (s.includes('booking.com')) return 'Booking.com';
  if (s.includes('expedia') || s.includes('vrbo')) return 'Expedia';
  if (s.includes('trip.com')) return 'Trip.com';
  return null;
}

function parseJapaneseRange(text) {
  let m = text.match(/(20\d{2})年(\d{1,2})月(\d{1,2})日\s*[～〜~-]\s*(?:(20\d{2})年)?(?:(\d{1,2})月)?(\d{1,2})日/);
  if (m) return [toIso(m[1],m[2],m[3]),toIso(m[4]||m[1],m[5]||m[2],m[6])];
  m = text.match(/(20\d{2})\/(\d{1,2})\/(\d{1,2})\s*[-–—]\s*(20\d{2})\/(\d{1,2})\/(\d{1,2})/);
  if (m) return [toIso(m[1],m[2],m[3]),toIso(m[4],m[5],m[6])];
  return [null,null];
}
function parseChineseLabeledDates(text) {
  const ci = text.match(/入住日期[:：]\s*(20\d{2})年(\d{1,2})月(\d{1,2})日/);
  const co = text.match(/退房日期[:：]\s*(20\d{2})年(\d{1,2})月(\d{1,2})日/);
  return [ci ? toIso(ci[1],ci[2],ci[3]) : null, co ? toIso(co[1],co[2],co[3]) : null];
}
function parseAgodaDates(text, subject) {
  let m = text.match(/Check-in\s+チェックイン\s+[^()]*\((\d{1,2})-(\d{1,2})-(20\d{2})\).*?Check-out\s+チェックアウト\s+[^()]*\((\d{1,2})-(\d{1,2})-(20\d{2})\)/i);
  if (m) return [toIso(m[3],m[2],m[1]),toIso(m[6],m[5],m[4])];
  m = text.match(/到着\s+([A-Za-z]+)\s+(\d{1,2}),\s*(20\d{2}).*?出発\s+([A-Za-z]+)\s+(\d{1,2}),\s*(20\d{2})/i);
  if (m) return [englishDate(m[1],m[2],m[3]),englishDate(m[4],m[5],m[6])];
  m = `${subject} ${text}`.match(/\(([A-Za-z]+)\s+(\d{1,2})-(\d{1,2}),\s*(20\d{2})\)/);
  if (m) return [englishDate(m[1],m[2],m[4]),englishDate(m[1],m[3],m[4])];
  m = text.match(/\b([A-Za-z]+)\s+(\d{1,2}),\s*(20\d{2})\s+([A-Za-z]+)\s+(\d{1,2}),\s*(20\d{2})/);
  if (m) return [englishDate(m[1],m[2],m[3]),englishDate(m[4],m[5],m[6])];
  return [null,null];
}

function parseAirbnb(subject, body) {
  const all = `${subject} ${body}`;
  const ignored = /レビュー|review|メール設定|サービス料体系|本人確認|KYC/i.test(subject) && !/予約|受取金|支払いリクエスト/i.test(subject);
  let messageType = 'unknown';
  if (ignored) messageType = 'ignored';
  else if (/受取金.*送金|payout/i.test(subject)) messageType = 'payout';
  else if (/キャンセル|cancel/i.test(subject)) messageType = 'reservation_cancelled';
  else if (/^RE:|ご予約に関するお問い合わせ|での.*ご予約/.test(subject)) messageType = 'guest_message';
  else if (/予約リマインダー|予約.*確定|到着します/.test(subject)) messageType = 'reservation';
  else if (/支払いリクエスト/.test(subject)) messageType = 'adjustment';

  const reservationCode = firstGroup(all,[
    /確認コード\s*([A-Z0-9]{8,16})/i,
    /hosting\/reservations\/details\/([A-Z0-9]{8,16})/i,
    /\b(H[A-Z0-9]{8,15})\b/
  ]);
  const externalListingId = firstGroup(all,[/\/rooms\/(\d{8,})/i,/\((\d{10,})\)\s*[A-Z0-9]{8,16}/i]);
  let guestName = firstGroup(subject,[/まもなく(.+?)さんが到着/]);
  if (!guestName) guestName = firstGroup(body,[/\s([A-Za-z★☆⁨⁩][^]{0,60}?)\s+予約者\s/]);
  if (guestName && guestName.includes('「')) guestName = null;

  let [checkIn,checkOut] = [null,null];
  let m = body.match(/宿泊\s*[•・]\s*(20\d{2})\/(\d{1,2})\/(\d{1,2})\s*[-–—]\s*(20\d{2})\/(\d{1,2})\/(\d{1,2})/);
  if (m) [checkIn,checkOut] = [toIso(m[1],m[2],m[3]),toIso(m[4],m[5],m[6])];
  if (!checkIn || !checkOut) [checkIn,checkOut] = parseJapaneseRange(all);
  if (!checkIn || !checkOut) {
    const dates = [...all.matchAll(/(20\d{2})年(\d{1,2})月(\d{1,2})日/g)].map(x=>toIso(x[1],x[2],x[3]));
    if (dates.length >= 2 && /チェックイン|ご予約|宿泊/.test(all)) [checkIn,checkOut] = [dates[0],dates[1]];
  }

  const gross = absNum(firstGroup(body,[/合計（JPY）\s*¥\s*([\d,]+)/,/ゲストが支払いを完了しました[\s\S]*?¥\s*([\d,]+)\s*x\s*\d+泊/]));
  const fee = absNum(firstGroup(body,[/ホストサービス料(?:（[^)]*）)?\s*-?¥\s*([\d,]+)/]));
  let payout = absNum(firstGroup(body,[/ホスティング収入\s*¥\s*([\d,]+)/,/支払い合計額[:：]\s*¥\s*([\d,]+)/]));
  if (messageType === 'payout' && payout == null) payout = absNum(firstGroup(subject,[/¥\s*([\d,]+)\s*JPY/])) || absNum(firstGroup(body,[/本日¥\s*([\d,]+)\s*JPY/]));
  const listingLabel = firstGroup(body,[
    externalListingId ? new RegExp(`\\/rooms\\/${externalListingId}[^\\]]*\\]\\s*([^\\[]+?)(?:\\s+ゲストルーム|\\s+Senさん|\\s+チェックイン)`) : /$a/,
    /宿泊\s*[•・].*?\s([^()]{5,180})\s*\(\d{10,}\)\s*[A-Z0-9]{8,16}/
  ]);
  const confidence = reservationCode && checkIn && checkOut ? 0.98 : externalListingId && (checkIn || reservationCode) ? 0.86 : messageType==='ignored' ? 0.99 : 0.6;
  return {messageType,reservationCode,externalListingId,guestName,listingLabel,checkIn,checkOut,gross,fee,payout,amountOriginal:null,amountCurrency:'JPY',confidence};
}

function parseBooking(subject, body) {
  const all = `${subject} ${body}`;
  let messageType = 'unknown';
  if (/新的预订|Booking confirmation|new booking/i.test(subject)) messageType='reservation';
  else if (/已取消|Cancellation|cancelled/i.test(subject)) messageType='reservation_cancelled';
  else if (/消息|message|guest request/i.test(subject) || /guest\.booking\.com/i.test(all)) messageType='guest_message';
  else if (/payout|支付|付款|payment/i.test(subject)) messageType='payout';
  if (/newsletter|Genius|商务差旅/.test(subject)) messageType='ignored';

  const reservationCode = firstGroup(all,[
    /确认订单号[:：]\s*(\d{7,12})/,
    /订单编号[:：]\s*(\d{7,12})/,
    /Booking confirmation\s*[—-]\s*(\d{7,12})/i,
    /Cancellation\s*[—-]\s*(\d{7,12})/i,
    /res_id=(\d{7,12})/,
    /\((\d{7,12}),\s*20\d{2}年/
  ]);
  const externalListingId = firstGroup(all,[/hotel_id=(\d+)/i,/hotel_id%3D(\d+)/i]);
  const guestName = firstGroup(body,[/住客姓名[:：]\s*(.*?)\s+入住日期[:：]/,/客人(.+?)的订单\d+已取消/]);
  const listingLabel = firstGroup(body,[/住宿名称[:：]\s*(.*?)\s+订单编号[:：]/]) || firstGroup(body,[/Booking\.com\s+([^\[]+?)\s+\[/]);
  let [checkIn,checkOut] = parseChineseLabeledDates(body);
  if (!checkIn) {
    const m=subject.match(/\((\d{7,12}),\s*(20\d{2})年(\d{1,2})月(\d{1,2})日/); if(m) checkIn=toIso(m[2],m[3],m[4]);
  }
  const confidence = reservationCode && checkIn && checkOut ? 0.96 : reservationCode && checkIn ? 0.82 : messageType==='ignored' ? 0.99 : 0.55;
  return {messageType,reservationCode,externalListingId,guestName,listingLabel,checkIn,checkOut,gross:null,fee:null,payout:null,amountOriginal:null,amountCurrency:'JPY',confidence};
}

function parseAgoda(subject, body) {
  const all = `${subject} ${body}`;
  let messageType='unknown';
  if (/One-time PIN|サインインリンク|在庫を更新|予約数UP|分析データ|campaign/i.test(subject)) messageType='ignored';
  else if (/CANCELLED|キャンセル/i.test(subject) && /予約|Booking/i.test(subject)) messageType='reservation_cancelled';
  else if (/Agoda予約ID\s*\d+\s*-\s*予約確定|Booking confirmation/i.test(subject) || /Booking confirmation\s+予約確認書/i.test(body)) messageType='reservation';
  else if (/^Reply from |^Inquiry by |^Special Request |^Notification from Agoda/i.test(subject)) messageType='guest_message';
  else if (/予約リクエスト/i.test(subject)) messageType='reservation_request';

  let reservationCode = firstGroup(all,[
    /Agoda予約ID\s*(\d{7,12})/i,
    /Booking ID\s*予約ID\s*(\d{7,12})/i,
    /予約\s*ID\s*[:：]\s*(\d{7,12})/i,
    /予約ID[:：\s•]*(\d{7,12})/i,
    /bookingID=(\d{7,12})/i
  ]);
  if (reservationCode === '0') reservationCode=null;
  const externalListingId = firstGroup(all,[/Property ID\s*(\d{5,})/i,/propertyId=(\d{5,})/i,/propertyID=(\d{5,})/i,/hotelId=(\d{5,})/i]);
  let guestName=null;
  const fm=body.match(/Customer First Name 宿泊者氏名（名）\s*(.*?)\s*Customer Last Name 宿泊者氏名（姓）\s*(.*?)\s*Country of Residence/i);
  if (fm) guestName=clean(`${fm[1]} ${fm[2]}`);
  if (!guestName) guestName=firstGroup(subject,[/Reply from (.+?) \(/i,/Inquiry by (.+?) \(/i]);
  if (!guestName) guestName=firstGroup(body,[/【アゴダ新着】(.+?)さんから/]);

  const [checkIn,checkOut]=parseAgodaDates(body,subject);
  const gross=absNum(firstGroup(body,[/Reference sell rate \(incl\. taxes & fees\)[^J]{0,100}JPY\s*([\d,]+(?:\.\d+)?)/i]));
  const fee=absNum(firstGroup(body,[/Commission 手数料\s*JPY\s*-?([\d,]+(?:\.\d+)?)/i]));
  const payout=absNum(firstGroup(body,[/Net rate \(incl\. taxes & fees\)[^J]{0,100}JPY\s*([\d,]+(?:\.\d+)?)/i]));
  let amountOriginal=null, amountCurrency=null;
  const om=body.match(/合計お支払い金額[\s\S]{0,150}?\b([A-Z]{3})\s*([\d,]+(?:\.\d+)?)/i);
  if (om) { amountCurrency=om[1].toUpperCase(); amountOriginal=Number(om[2].replace(/,/g,'')); }
  if (!amountCurrency && (gross!=null || payout!=null)) amountCurrency='JPY';
  const listingLabel=firstGroup(body,[/Booking confirmation\s+予約確認書\s+(.+?)\s+\(Property ID/i]) || firstGroup(subject,[/^(.+?)の予約リクエスト/]);
  const confidence = messageType==='reservation' && reservationCode && externalListingId && checkIn && checkOut ? 0.99 : reservationCode && (checkIn||externalListingId) ? 0.88 : messageType==='ignored' ? 0.99 : 0.58;
  return {messageType,reservationCode,externalListingId,guestName,listingLabel,checkIn,checkOut,gross,fee,payout,amountOriginal,amountCurrency:amountCurrency||'JPY',confidence};
}

function parseGeneric(provider,subject,body) {
  const all=`${subject} ${body}`;
  const [checkIn,checkOut]=parseJapaneseRange(all);
  const messageType=/cancel|キャンセル/i.test(subject)?'reservation_cancelled':/message|メッセージ|問い合わせ/i.test(subject)?'guest_message':/reservation|予約|booking/i.test(subject)?'reservation':'unknown';
  const reservationCode=firstGroup(all,[/(?:reservation|booking|予約)(?:\s*(?:id|number|番号|コード))?\s*[:：#]?\s*([A-Z0-9-]{6,16})/i]);
  return {messageType,reservationCode,externalListingId:null,guestName:null,listingLabel:null,checkIn,checkOut,gross:null,fee:null,payout:null,amountOriginal:null,amountCurrency:'JPY',confidence:0.45};
}
function parseByProvider(provider,subject,body) {
  if (provider==='Airbnb') return parseAirbnb(subject,body);
  if (provider==='Booking.com') return parseBooking(subject,body);
  if (provider==='Agoda') return parseAgoda(subject,body);
  return parseGeneric(provider,subject,body);
}

async function setSourceStatus(id, patch) { await sb.from('email_ingestion_sources').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id); }
async function mappingFor(orgId,provider,externalListingId) {
  if (!externalListingId) return null;
  const {data}=await sb.from('provider_listing_mappings').select('unit_id').eq('organization_id',orgId).eq('provider',provider).eq('external_listing_key',externalListingId).limit(1);
  return data?.[0]?.unit_id || null;
}
async function linkedByCode(row) {
  if (!row.reservation_code) return null;
  const {data}=await sb.from('ota_email_messages').select('reservation_id').eq('organization_id',row.organization_id).eq('provider',row.provider).eq('reservation_code',row.reservation_code).not('reservation_id','is',null).limit(1);
  return data?.[0]?.reservation_id || null;
}
async function reservationByDates(row,unitId) {
  if (!unitId || !row.check_in || !row.check_out) return null;
  const {data}=await sb.from('reservations').select('id,gross_amount_yen,platform_fee_yen').eq('organization_id',row.organization_id).eq('unit_id',unitId).eq('check_in',row.check_in).eq('check_out',row.check_out).neq('status','cancelled').limit(1);
  return data?.[0] || null;
}
async function hasIcalOccupancy(row,unitId) {
  if (!unitId || !row.check_in || !row.check_out) return false;
  const {data}=await sb.from('ical_events').select('id').eq('organization_id',row.organization_id).eq('unit_id',unitId).eq('starts_on',row.check_in).eq('ends_on',row.check_out).eq('active',true).limit(1);
  return !!data?.length;
}
async function updateReservationFinancials(reservationId,row) {
  if (!reservationId) return;
  const {data}=await sb.from('reservations').select('gross_amount_yen,platform_fee_yen').eq('id',reservationId).single();
  if (!data) return;
  const patch={};
  if (data.gross_amount_yen==null && row.gross_amount_yen!=null) patch.gross_amount_yen=row.gross_amount_yen;
  if (data.platform_fee_yen==null && row.platform_fee_yen!=null) patch.platform_fee_yen=row.platform_fee_yen;
  if (Object.keys(patch).length) await sb.from('reservations').update(patch).eq('id',reservationId);
}
async function writeFinancialRecord(row,unitId,reservationId) {
  if (row.currency_code!=='JPY') return;
  if (row.gross_amount_yen==null && row.platform_fee_yen==null && row.payout_amount_yen==null) return;
  const record={organization_id:row.organization_id,provider:row.provider,source_type:'email',source_key:`email:${row.external_message_id}`,external_reservation_id:row.reservation_code,external_listing_key:row.external_listing_id,reservation_id:reservationId||null,unit_id:unitId||null,guest_name:row.guest_name,check_in:row.check_in,check_out:row.check_out,gross_amount_yen:row.gross_amount_yen,platform_fee_yen:row.platform_fee_yen,payout_amount_yen:row.payout_amount_yen,currency_code:'JPY',raw_payload:{email_message_id:row.id,message_type:row.message_type},updated_at:new Date().toISOString()};
  const {error}=await sb.from('external_financial_records').upsert(record,{onConflict:'organization_id,provider,source_key'});
  if(error) throw error;
}
async function matchEmail(row) {
  if (row.message_type==='ignored' || row.message_type==='unknown') {
    await sb.from('ota_email_messages').update({match_status:'ignored',match_reason:row.message_type==='ignored'?'non-operational OTA email':'not actionable yet'}).eq('id',row.id); return;
  }
  let reservationId=await linkedByCode(row), unitId=null;
  if (!reservationId) unitId=await mappingFor(row.organization_id,row.provider,row.external_listing_id);
  if (!reservationId && !unitId && row.external_listing_id) {
    await sb.from('ota_email_messages').update({match_status:'needs_mapping',match_reason:`${row.provider} listing ${row.external_listing_id} needs room mapping`}).eq('id',row.id);
    await writeFinancialRecord(row,null,null); return;
  }
  if (!reservationId && unitId) { const existing=await reservationByDates(row,unitId); if (existing) reservationId=existing.id; }
  if (!reservationId && unitId && row.message_type==='reservation' && row.check_in && row.check_out) {
    const icalOk=await hasIcalOccupancy(row,unitId);
    if (icalOk) {
      const status=row.check_out<=tokyoToday()?'completed':'confirmed';
      const {data,error}=await sb.from('reservations').insert({organization_id:row.organization_id,unit_id:unitId,status,check_in:row.check_in,check_out:row.check_out,channel:row.provider,guest_name_snapshot:row.guest_name||`${row.provider} ゲスト`,gross_amount_yen:row.gross_amount_yen,platform_fee_yen:row.platform_fee_yen,local_note:`OTAメール + iCal 自動照合${row.reservation_code?` · ${row.reservation_code}`:''}`}).select('id').single();
      if (error) { await sb.from('ota_email_messages').update({match_status:'conflict',match_reason:`auto-create blocked: ${String(error.message).slice(0,180)}`}).eq('id',row.id); return; }
      reservationId=data.id;
    }
  }
  if (reservationId) {
    await sb.from('ota_email_messages').update({reservation_id:reservationId,match_status:'matched',match_reason:'matched by reservation code / listing / dates'}).eq('id',row.id);
    if (row.reservation_code) await sb.from('ota_email_messages').update({reservation_id:reservationId,match_status:'matched',match_reason:'linked through same reservation code'}).eq('organization_id',row.organization_id).eq('provider',row.provider).eq('reservation_code',row.reservation_code).is('reservation_id',null);
    await updateReservationFinancials(reservationId,row);
    if (!unitId) { const {data}=await sb.from('reservations').select('unit_id').eq('id',reservationId).single(); unitId=data?.unit_id||null; }
    await writeFinancialRecord(row,unitId,reservationId); return;
  }
  const reason = !row.check_in || !row.check_out ? 'waiting for complete stay dates / matching email' : unitId ? 'no exact iCal or PMS reservation match yet' : 'waiting for room mapping';
  await sb.from('ota_email_messages').update({match_status:unitId?'unmatched':'needs_mapping',match_reason:reason}).eq('id',row.id);
  await writeFinancialRecord(row,unitId,null);
}

const { data: sources, error: sourceErr } = await sb.from('email_ingestion_sources').select('id,organization_id,email_address,worker_slot,status,last_synced_at').eq('provider','icloud').eq('mode','imap').neq('status','paused');
if (sourceErr) throw sourceErr;
for (const source of sources || []) {
  if (!source.worker_slot) continue;
  const password=process.env[`ICLOUD_${source.worker_slot}_APP_PASSWORD`];
  if (!password) { await setSourceStatus(source.id,{status:'setup_required',last_error:`Missing ICLOUD_${source.worker_slot}_APP_PASSWORD`}); continue; }
  const client=new ImapFlow({host:'imap.mail.me.com',port:993,secure:true,auth:{user:source.email_address,pass:password},logger:false});
  try {
    await client.connect(); const lock=await client.getMailboxLock('INBOX');
    try {
      const since=source.last_synced_at?new Date(new Date(source.last_synced_at).getTime()-48*3600*1000):new Date(Date.now()-14*86400*1000);
      const uids=await client.search({since}); let ingested=0,matched=0;
      for await (const msg of client.fetch(uids,{source:true,envelope:true,uid:true})) {
        const parsed=await simpleParser(msg.source); const from=parsed.from?.text||msg.envelope?.from?.map(x=>x.address).join(', ')||''; const subject=clean(parsed.subject||msg.envelope?.subject||'');
        const provider=detectProvider(from,subject); if(!provider) continue; const body=clean(parsed.text||''); const p=parseByProvider(provider,subject,body); const externalMessageId=parsed.messageId||`${source.email_address}:${msg.uid}`;
        const payload={organization_id:source.organization_id,source_id:source.id,provider,external_message_id:externalMessageId,sender:from||null,recipient:parsed.to?.text||source.email_address,subject:subject||null,sent_at:parsed.date?.toISOString?.()||null,message_type:p.messageType,reservation_code:p.reservationCode,guest_name:p.guestName,listing_label:p.listingLabel,external_listing_id:p.externalListingId,check_in:p.checkIn,check_out:p.checkOut,gross_amount_yen:p.gross,platform_fee_yen:p.fee,payout_amount_yen:p.payout,amount_original:p.amountOriginal,amount_currency:p.amountCurrency,currency_code:p.amountCurrency==='JPY'?'JPY':p.amountCurrency||'JPY',body_text:body.slice(0,30000)||null,parse_confidence:p.confidence,parsed_at:new Date().toISOString(),raw_payload:{uid:msg.uid},updated_at:new Date().toISOString()};
        const {data:row,error}=await sb.from('ota_email_messages').upsert(payload,{onConflict:'organization_id,provider,external_message_id',ignoreDuplicates:false}).select('*').single(); if(error) throw error; ingested++;
        try { await matchEmail(row); const {data:r}=await sb.from('ota_email_messages').select('match_status').eq('id',row.id).single(); if(r?.match_status==='matched') matched++; } catch(e) { console.error(`match ${provider} ${p.reservationCode||externalMessageId}:`,e.message); }
      }
      await setSourceStatus(source.id,{status:'connected',last_synced_at:new Date().toISOString(),last_error:null}); console.log(`${source.email_address}: ${ingested} OTA messages processed, ${matched} matched`);
    } finally { lock.release(); }
    await client.logout();
  } catch(err) { console.error(`${source.email_address}:`,err.message); await setSourceStatus(source.id,{status:'error',last_error:String(err.message).slice(0,500)}); try{await client.logout()}catch{} }
}
