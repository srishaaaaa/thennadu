const fs = require('fs');
let code = fs.readFileSync('src/pages/Dashboard.tsx', 'utf8');

// Add expenses to Promise.all in loadData
code = code.replace(
  \        supabase.from('coupons')\n          .select('id, code, percentage, is_active, expiry_date, usage_limit, usage_count, min_order_value')\n          .order('created_at', { ascending: false }),\n      ])\,
  \        supabase.from('coupons')\n          .select('id, code, percentage, is_active, expiry_date, usage_limit, usage_count, min_order_value')\n          .order('created_at', { ascending: false }),\n        supabase.from('expenses').select('amount')\n      ])\
);

// Add eRes to await Promise.all
code = code.replace(
  \const [cRes, oRes, couponRes] = await Promise.all([\,
  \const [cRes, oRes, couponRes, eRes] = await Promise.all([\
);

// Add expenses to state
code = code.replace(
  \setCoupons((couponRes.data || []) as DashboardCoupon[])\,
  \setCoupons((couponRes.data || []) as DashboardCoupon[])\n      setExpensesList((eRes.data || []) as any[])\
);

fs.writeFileSync('src/pages/Dashboard.tsx', code);
