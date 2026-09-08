import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const url = `${process.env.VITE_SUPABASE_URL}/rest/v1/rpc/complete_advance_order`;
const key = process.env.VITE_SUPABASE_ANON_KEY;

async function test() {
  // First fetch a pending order
  const fetchUrl = `${process.env.VITE_SUPABASE_URL}/rest/v1/advance_orders?status=eq.pending_deposit&select=id&limit=1`;
  const res = await fetch(fetchUrl, {
    headers: { 'apikey': key, 'Authorization': `Bearer ${key}` }
  });
  const data = await res.json();
  if (!data || data.length === 0) { console.log('No pending orders'); return; }
  
  const orderId = data[0].id;
  console.log('Testing complete on:', orderId);
  
  const rpcRes = await fetch(url, {
    method: 'POST',
    headers: {
      'apikey': key,
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: JSON.stringify({
      p_order_id: orderId,
      p_payment_method: 'cash',
      p_remarks: 'Test'
    })
  });
  
  console.log('Status:', rpcRes.status);
  const result = await rpcRes.json();
  console.log('Result:', JSON.stringify(result, null, 2));
}

test();
