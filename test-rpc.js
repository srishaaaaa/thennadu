import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function test() {
  const { data: orders } = await supabase.from('advance_orders').select('*').eq('status', 'pending_deposit').limit(1);
  if (!orders || orders.length === 0) { console.log('No pending orders'); return; }
  const orderId = orders[0].id;
  console.log('Testing complete on:', orderId);
  const { data, error } = await supabase.rpc('complete_advance_order', {
    p_order_id: orderId,
    p_payment_method: 'cash',
    p_remarks: 'Test'
  });
  console.log('Data:', data);
  console.log('Error:', error);
}
test();
