import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://cxaoomvagqpuatlfthlx.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SERVICE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY is missing');
const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

function todayTokyo(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())}
function first(rows,key){return rows.find(r=>r[key]!=null&&r[key]!=='')?.[key]??null}
function bestAmount(rows,key){return rows.find(r=>r[key]!=null)?.[key]??null}
function cleanGuest(v){if(!v)return null;return String(v).replace(/[⁨⁩]/g,'').trim()||null}

async function unitForListing(orgId,provider,externalListingId){
  if(!externalListingId)return null;
  const {data,error}=await sb.from('provider_listing_mappings').select('unit_id').eq('organization_id',orgId).eq('provider',provider).eq('external_listing_key',externalListingId).limit(1);
  if(error)throw error;
  return data?.[0]?.unit_id||null;
}
async function exactReservation(orgId,unitId,checkIn,checkOut){
  if(!unitId||!checkIn||!checkOut)return null;
  const {data,error}=await sb.from('reservations').select('id,unit_id,status,gross_amount_yen,platform_fee_yen').eq('organization_id',orgId).eq('unit_id',unitId).eq('check_in',checkIn).eq('check_out',checkOut).limit(2);
  if(error)throw error;
  return data?.find(r=>r.status!=='cancelled')||data?.[0]||null;
}
async function exactIcal(orgId,unitId,checkIn,checkOut){
  if(!unitId||!checkIn||!checkOut)return null;
  const {data,error}=await sb.from('ical_events').select('id,summary').eq('organization_id',orgId).eq('unit_id',unitId).eq('starts_on',checkIn).eq('ends_on',checkOut).eq('active',true).limit(2);
  if(error)throw error;
  return data?.[0]||null;
}
async function writeFinance(group,unitId,reservationId){
  const jpy=group.filter(r=>(r.currency_code||r.amount_currency||'JPY')==='JPY');
  const gross=bestAmount(jpy,'gross_amount_yen'),fee=bestAmount(jpy,'platform_fee_yen'),payout=bestAmount(jpy,'payout_amount_yen');
  if(gross==null&&fee==null&&payout==null)return;
  const sourceRow=jpy.find(r=>r.gross_amount_yen!=null||r.platform_fee_yen!=null)||jpy.find(r=>r.payout_amount_yen!=null)||jpy[0];
  const payload={organization_id:sourceRow.organization_id,provider:sourceRow.provider,source_type:'email',source_key:`reservation:${sourceRow.provider}:${sourceRow.reservation_code}`,external_reservation_id:sourceRow.reservation_code,external_listing_key:first(jpy,'external_listing_id'),reservation_id:reservationId||null,unit_id:unitId||null,guest_name:cleanGuest(first(jpy,'guest_name')),check_in:first(jpy,'check_in'),check_out:first(jpy,'check_out'),gross_amount_yen:gross,platform_fee_yen:fee,payout_amount_yen:payout,currency_code:'JPY',raw_payload:{email_message_ids:jpy.map(x=>x.id)},updated_at:new Date().toISOString()};
  const {error}=await sb.from('external_financial_records').upsert(payload,{onConflict:'organization_id,provider,source_key'});
  if(error)throw error;
}
async function fillReservationFinancials(reservationId,gross,fee){
  if(!reservationId)return;
  const {data,error}=await sb.from('reservations').select('gross_amount_yen,platform_fee_yen').eq('id',reservationId).single();
  if(error)throw error;
  const patch={};
  if(data.gross_amount_yen==null&&gross!=null)patch.gross_amount_yen=gross;
  if(data.platform_fee_yen==null&&fee!=null)patch.platform_fee_yen=fee;
  if(Object.keys(patch).length){const {error:e}=await sb.from('reservations').update(patch).eq('id',reservationId);if(e)throw e;}
}
async function markRows(rows,patch){
  const ids=rows.map(r=>r.id);if(!ids.length)return;
  const {error}=await sb.from('ota_email_messages').update({...patch,updated_at:new Date().toISOString()}).in('id',ids);if(error)throw error;
}

const {data:rows,error}=await sb.from('ota_email_messages').select('id,organization_id,provider,external_message_id,message_type,reservation_code,guest_name,external_listing_id,check_in,check_out,gross_amount_yen,platform_fee_yen,payout_amount_yen,currency_code,amount_currency,sent_at,reservation_id,match_status').not('reservation_code','is',null).order('sent_at',{ascending:true});
if(error)throw error;

const groups=new Map();
for(const r of rows||[]){
  const code=String(r.reservation_code||'').trim();
  if(!code||code.length<5)continue;
  const k=`${r.organization_id}|${r.provider}|${code}`;
  if(!groups.has(k))groups.set(k,[]);groups.get(k).push(r);
}

let linked=0,created=0,waiting=0,cancelled=0;
for(const group of groups.values()){
  const operational=group.filter(r=>!['ignored','unknown'].includes(r.message_type));
  if(!operational.length)continue;
  const base=operational[0],orgId=base.organization_id,provider=base.provider,code=base.reservation_code;
  const externalListingId=first(operational,'external_listing_id');
  const unitId=await unitForListing(orgId,provider,externalListingId);
  const checkIn=first(operational,'check_in'),checkOut=first(operational,'check_out');
  const guest=cleanGuest(first(operational,'guest_name'))||`${provider} ゲスト`;
  const gross=bestAmount(operational.filter(r=>(r.currency_code||'JPY')==='JPY'),'gross_amount_yen');
  const fee=bestAmount(operational.filter(r=>(r.currency_code||'JPY')==='JPY'),'platform_fee_yen');
  const hasReservationMail=operational.some(r=>r.message_type==='reservation');
  const hasCancellation=operational.some(r=>r.message_type==='reservation_cancelled');
  let reservationId=first(operational,'reservation_id');
  let reservation=null;
  if(!reservationId)reservation=await exactReservation(orgId,unitId,checkIn,checkOut);
  if(reservation)reservationId=reservation.id;

  if(hasCancellation){
    if(reservationId){
      const {error:e}=await sb.from('reservations').update({status:'cancelled'}).eq('id',reservationId);if(e)throw e;
      await markRows(operational,{reservation_id:reservationId,match_status:'matched',match_reason:'cancellation linked by OTA reservation code'});
      await writeFinance(operational,unitId,reservationId);
      cancelled++;
    }else{
      await markRows(operational,{match_status:'ignored',match_reason:'cancelled OTA reservation was never created in PMS'});
      await writeFinance(operational,unitId,null);
    }
    continue;
  }

  if(!reservationId&&hasReservationMail&&unitId&&checkIn&&checkOut){
    const occupancy=await exactIcal(orgId,unitId,checkIn,checkOut);
    const evidence=occupancy?'OTA邮件 + iCal 自动照合':'OTA邮件 + 已确认房源对应';
    const status=checkOut<=todayTokyo()?'completed':'confirmed';
    const {data,error:e}=await sb.from('reservations').insert({organization_id:orgId,unit_id:unitId,status,check_in:checkIn,check_out:checkOut,channel:provider,guest_name_snapshot:guest,gross_amount_yen:gross,platform_fee_yen:fee,local_note:`${evidence} · ${code}`}).select('id').single();
    if(!e){reservationId=data.id;created++;}
    else console.error(`create ${provider} ${code}: ${e.message}`);
  }

  if(reservationId){
    await markRows(operational,{reservation_id:reservationId,match_status:'matched',match_reason:'consolidated by OTA reservation code + explicit room/date evidence'});
    await fillReservationFinancials(reservationId,gross,fee);
    await writeFinance(operational,unitId,reservationId);
    linked++;
  }else{
    const status=!unitId&&externalListingId?'needs_mapping':'unmatched';
    const reason=!unitId&&externalListingId?`${provider} listing ${externalListingId} needs room mapping`:!checkIn||!checkOut?'waiting for complete stay dates from another OTA email':'no exact PMS match yet';
    await markRows(operational,{match_status:status,match_reason:reason});
    await writeFinance(operational,unitId,null);
    waiting++;
  }
}
console.log(`post-match complete: linked=${linked}, created=${created}, cancelled=${cancelled}, waiting=${waiting}`);
