-- Drop table constraint if exists
ALTER TABLE public.advance_order_payments 
DROP CONSTRAINT IF EXISTS advance_order_payments_payment_method_check;

-- Update create_advance_order to remove payment method check
CREATE OR REPLACE FUNCTION public.create_advance_order(
  p_customer_name text, p_phone text, p_address text, p_product_name text,
  p_category text, p_description text, p_total_amount numeric, p_deposit_amount numeric,
  p_expected_delivery_date date, p_remarks text, p_payment_method text, p_created_by_name text,
  p_products jsonb default '[]'::jsonb
)
RETURNS public.advance_orders
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function
DECLARE
  v_order public.advance_orders;
  v_now timestamptz := now();
  v_deposit_id text;
BEGIN
  IF trim(coalesce(p_customer_name,'')) = '' THEN RAISE EXCEPTION 'Customer name is required'; END IF;
  IF trim(coalesce(p_phone,'')) = '' THEN RAISE EXCEPTION 'Phone number is required'; END IF;
  IF trim(coalesce(p_product_name,'')) = '' THEN RAISE EXCEPTION 'Product name is required'; END IF;
  IF coalesce(p_total_amount,0) <= 0 THEN RAISE EXCEPTION 'Total amount must be greater than zero'; END IF;
  IF coalesce(p_deposit_amount,0) <= 0 OR p_deposit_amount >= p_total_amount THEN RAISE EXCEPTION 'Deposit must be greater than zero and less than the total amount'; END IF;
  
  v_deposit_id := 'DEP-' || to_char(v_now AT TIME ZONE 'Asia/Kolkata','YYYYMMDD') || '-' || lpad(nextval('public.deposit_number_seq')::text,4,'0');
  
  INSERT INTO public.advance_orders(
    deposit_id, customer_name, phone, address, product_name, products, category, description,
    total_amount, deposit_amount, expected_delivery_date, remarks, created_by, created_by_name, created_at, updated_at
  )
  VALUES (
    v_deposit_id, trim(p_customer_name), trim(p_phone), trim(coalesce(p_address,'')), trim(p_product_name),
    CASE WHEN jsonb_typeof(coalesce(p_products,'[]'::jsonb))='array' THEN coalesce(p_products,'[]'::jsonb) ELSE '[]'::jsonb END,
    trim(coalesce(p_category,'')), trim(coalesce(p_description,'')), round(p_total_amount,2), round(p_deposit_amount,2),
    p_expected_delivery_date, trim(coalesce(p_remarks,'')), auth.uid(), trim(coalesce(p_created_by_name,'')), v_now, v_now
  )
  RETURNING * INTO v_order;

  INSERT INTO public.advance_order_payments(
    advance_order_id, payment_type, amount, payment_method, remarks, received_by, received_at
  )
  VALUES (
    v_order.id, 'deposit', v_order.deposit_amount, lower(p_payment_method), coalesce(p_remarks,''), auth.uid(), v_now
  );

  INSERT INTO public.advance_order_timeline(
    advance_order_id, event_type, label, created_by, created_at
  ) VALUES
    (v_order.id, 'created', 'Created', auth.uid(), v_now),
    (v_order.id, 'deposit_received', 'Deposit Received', auth.uid(), v_now);

  RETURN v_order;
END;
$function;

-- Update complete_advance_order to remove payment method check
CREATE OR REPLACE FUNCTION public.complete_advance_order(p_order_id uuid, p_payment_method text, p_remarks text default '')
RETURNS TABLE(order_id uuid, invoice_no text, completed_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function
DECLARE
  v_advance public.advance_orders;
  v_order_id uuid := gen_random_uuid();
  v_invoice text;
  v_now timestamptz := now();
  v_items jsonb;
  v_item jsonb;
BEGIN
  SELECT * INTO v_advance FROM public.advance_orders WHERE id=p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Advance order not found'; END IF;
  IF v_advance.status='cancelled' THEN RAISE EXCEPTION 'A cancelled order cannot be completed'; END IF;
  IF v_advance.status='completed' THEN RAISE EXCEPTION 'Order is already completed'; END IF;

  v_items := coalesce(v_advance.products, '[]'::jsonb);
  IF jsonb_array_length(v_items) = 0 THEN
    v_items := jsonb_build_array(jsonb_build_object(
      'product_name', v_advance.product_name,
      'category', coalesce(v_advance.category,''),
      'quantity', 1,
      'unit', 'unit',
      'unit_price', v_advance.total_amount,
      'line_total', v_advance.total_amount,
      'is_manual', true
    ));
  END IF;

  v_invoice := 'INV-' || to_char(v_now AT TIME ZONE 'Asia/Kolkata','YYYYMMDD') || '-' || lpad(nextval('public.invoice_number_seq')::text,4,'0');

  INSERT INTO public.orders(
    id, invoice_no, customer_name, phone, address, user_id, items, subtotal, total, status,
    order_mode, order_type, shipping, delivery_charge, discount_amount, manual_discount_amount,
    payment_mode, payment_method, created_at, updated_at
  )
  VALUES (
    v_order_id, v_invoice, v_advance.customer_name, v_advance.phone, v_advance.address, auth.uid(), v_items,
    v_advance.total_amount, v_advance.total_amount, 'completed', 'offline', 'advance_order', 0, 0, 0, 0,
    lower(p_payment_method), lower(p_payment_method), v_now, v_now
  );

  FOR v_item IN SELECT value FROM jsonb_array_elements(v_items) LOOP
    INSERT INTO public.order_items(
      order_id, product_name, category, quantity, unit, unit_price, line_total, is_manual, source, note
    )
    VALUES (
      v_order_id, v_item->>'product_name', v_item->>'category', (v_item->>'quantity')::numeric,
      coalesce(v_item->>'unit','unit'), (v_item->>'unit_price')::numeric, (v_item->>'line_total')::numeric,
      coalesce((v_item->>'is_manual')::boolean, true), 'advance_order', coalesce(v_item->>'note','')
    );
  END LOOP;

  INSERT INTO public.advance_order_payments(
    advance_order_id, payment_type, amount, payment_method, remarks, received_by, received_at
  )
  VALUES (
    p_order_id, 'remaining', v_advance.remaining_balance, lower(p_payment_method), coalesce(p_remarks,''), auth.uid(), v_now
  );

  UPDATE public.advance_orders SET
    status='completed', completed_at=v_now, completed_order_id=v_order_id, invoice_number=v_invoice,
    final_payment_method=lower(p_payment_method),
    remarks=CASE WHEN trim(coalesce(p_remarks,''))='' THEN remarks ELSE p_remarks END,
    updated_at=v_now
  WHERE id=p_order_id;

  INSERT INTO public.advance_order_timeline(
    advance_order_id, event_type, label, remarks, created_by, created_at
  ) VALUES (
    p_order_id, 'remaining_payment_received', 'Remaining Payment Received', coalesce(p_remarks,''), auth.uid(), v_now
  ), (
    p_order_id, 'completed', 'Order Completed', 'Invoice ' || v_invoice || ' generated', auth.uid(), v_now
  );

  RETURN QUERY SELECT v_order_id, v_invoice, v_now;
END;
$function;

-- Update complete_advance_order_v2 to remove payment method check
CREATE OR REPLACE FUNCTION public.complete_advance_order_v2(
  p_order_id uuid,
  p_payment_method text,
  p_remarks text DEFAULT ''
)
RETURNS TABLE(order_id uuid, invoice_no text, completed_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function
DECLARE
  v_advance public.advance_orders;
  v_order_id uuid := gen_random_uuid();
  v_invoice text;
  v_now timestamptz := now();
  v_items jsonb;
  v_item jsonb;
  v_total_discount numeric := 0;
BEGIN
  SELECT * INTO v_advance FROM public.advance_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Advance order not found'; END IF;
  IF v_advance.status = 'cancelled' THEN RAISE EXCEPTION 'A cancelled order cannot be completed'; END IF;
  IF v_advance.status = 'completed' THEN RAISE EXCEPTION 'Order is already completed'; END IF;

  v_items := coalesce(v_advance.products, '[]'::jsonb);
  IF jsonb_array_length(v_items) = 0 THEN
    v_items := jsonb_build_array(jsonb_build_object(
      'product_name', v_advance.product_name,
      'category', coalesce(v_advance.category, ''),
      'quantity', 1,
      'unit', 'unit',
      'unit_price', v_advance.total_amount,
      'line_total', v_advance.total_amount,
      'is_manual', true
    ));
  END IF;

  v_invoice := 'INV-' || to_char(v_now AT TIME ZONE 'Asia/Kolkata', 'YYYYMMDD') || '-' || lpad(nextval('public.invoice_number_seq')::text, 4, '0');

  INSERT INTO public.orders(
    id, invoice_no, customer_name, phone, address, user_id, items,
    subtotal, total, status, order_mode, order_type,
    shipping, delivery_charge, discount_amount, manual_discount_amount,
    payment_mode, payment_method, created_at, updated_at
  ) VALUES (
    v_order_id, v_invoice, v_advance.customer_name, v_advance.phone, v_advance.address, auth.uid(), v_items,
    v_advance.total_amount, v_advance.total_amount, 'completed', 'offline', 'advance_order',
    0, 0, v_total_discount, 0,
    lower(p_payment_method), lower(p_payment_method),
    v_now, v_now
  );

  FOR v_item IN SELECT value FROM jsonb_array_elements(v_items) LOOP
    INSERT INTO public.order_items(
      order_id, product_name, category, quantity, unit, unit_price, line_total, is_manual, source, note
    ) VALUES (
      v_order_id, v_item->>'product_name', v_item->>'category', (v_item->>'quantity')::numeric,
      coalesce(v_item->>'unit', 'unit'), (v_item->>'unit_price')::numeric, (v_item->>'line_total')::numeric,
      coalesce((v_item->>'is_manual')::boolean, true), 'advance_order', coalesce(v_item->>'note', '')
    );
  END LOOP;

  INSERT INTO public.advance_order_payments(
    advance_order_id, payment_type, amount, payment_method, remarks, received_by, received_at
  ) VALUES (
    p_order_id, 'remaining', v_advance.remaining_balance,
    lower(p_payment_method), coalesce(p_remarks, ''), auth.uid(), v_now
  );

  UPDATE public.advance_orders SET
    status               = 'completed',
    completed_at         = v_now,
    completed_order_id   = v_order_id,
    invoice_number       = v_invoice,
    final_payment_method = lower(p_payment_method),
    remarks              = CASE WHEN trim(coalesce(p_remarks, '')) = '' THEN remarks ELSE p_remarks END,
    updated_at           = v_now
  WHERE id = p_order_id;

  INSERT INTO public.advance_order_timeline(
    advance_order_id, event_type, label, remarks, created_by, created_at
  ) VALUES
    (p_order_id, 'remaining_payment_received', 'Remaining Payment Received', coalesce(p_remarks, ''), auth.uid(), v_now),
    (p_order_id, 'completed', 'Order Completed', 'Invoice ' || v_invoice || ' generated', auth.uid(), v_now);

  RETURN QUERY SELECT v_order_id, v_invoice, v_now;
END;
$function;

-- Update complete_advance_order_v3 to remove payment method check
CREATE OR REPLACE FUNCTION public.complete_advance_order_v3(
  p_order_id uuid,
  p_payment_method text,
  p_final_amount numeric,
  p_coupon_code text DEFAULT NULL,
  p_coupon_discount numeric DEFAULT 0,
  p_manual_discount numeric DEFAULT 0,
  p_remarks text DEFAULT ''
)
RETURNS TABLE(order_id uuid, invoice_no text, completed_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function
DECLARE
  v_advance public.advance_orders;
  v_order_id uuid := gen_random_uuid();
  v_invoice text;
  v_now timestamptz := now();
  v_items jsonb;
  v_item jsonb;
  v_total_discount numeric := 0;
BEGIN
  SELECT * INTO v_advance FROM public.advance_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Advance order not found'; END IF;
  IF v_advance.status = 'cancelled' THEN RAISE EXCEPTION 'A cancelled order cannot be completed'; END IF;
  IF v_advance.status = 'completed' THEN RAISE EXCEPTION 'Order is already completed'; END IF;

  v_items := coalesce(v_advance.products, '[]'::jsonb);
  IF jsonb_array_length(v_items) = 0 THEN
    v_items := jsonb_build_array(jsonb_build_object(
      'product_name', v_advance.product_name,
      'category', coalesce(v_advance.category, ''),
      'quantity', 1,
      'unit', 'unit',
      'unit_price', v_advance.total_amount,
      'line_total', v_advance.total_amount,
      'is_manual', true
    ));
  END IF;

  v_total_discount := coalesce(p_coupon_discount, 0) + coalesce(p_manual_discount, 0);

  IF coalesce(p_coupon_code, '') != '' THEN
    UPDATE public.coupons 
    SET usage_count = usage_count + 1 
    WHERE code = p_coupon_code AND (usage_limit IS NULL OR usage_count < usage_limit);
  END IF;

  v_invoice := 'INV-' || to_char(v_now AT TIME ZONE 'Asia/Kolkata', 'YYYYMMDD') || '-' || lpad(nextval('public.invoice_number_seq')::text, 4, '0');

  INSERT INTO public.orders(
    id, invoice_no, customer_name, phone, address, user_id, items,
    subtotal, total, status, order_mode, order_type,
    shipping, delivery_charge, discount_amount, manual_discount_amount, coupon_code,
    payment_mode, payment_method, created_at, updated_at
  ) VALUES (
    v_order_id, v_invoice, v_advance.customer_name, v_advance.phone, v_advance.address, auth.uid(), v_items,
    v_advance.total_amount, v_advance.deposit_amount + p_final_amount, 'completed', 'offline', 'advance_order',
    0, 0, coalesce(p_coupon_discount, 0), coalesce(p_manual_discount, 0), nullif(trim(p_coupon_code), ''),
    lower(p_payment_method), lower(p_payment_method),
    v_now, v_now
  );

  FOR v_item IN SELECT value FROM jsonb_array_elements(v_items) LOOP
    INSERT INTO public.order_items(
      order_id, product_name, category, quantity, unit, unit_price, line_total, is_manual, source, note
    ) VALUES (
      v_order_id, v_item->>'product_name', v_item->>'category', (v_item->>'quantity')::numeric,
      coalesce(v_item->>'unit', 'unit'), (v_item->>'unit_price')::numeric, (v_item->>'line_total')::numeric,
      coalesce((v_item->>'is_manual')::boolean, true), 'advance_order', coalesce(v_item->>'note', '')
    );
  END LOOP;

  INSERT INTO public.advance_order_payments(
    advance_order_id, payment_type, amount, payment_method, remarks, received_by, received_at
  ) VALUES (
    p_order_id, 'remaining', p_final_amount,
    lower(p_payment_method), coalesce(p_remarks, ''), auth.uid(), v_now
  );

  UPDATE public.advance_orders SET
    status               = 'completed',
    completed_at         = v_now,
    completed_order_id   = v_order_id,
    invoice_number       = v_invoice,
    final_payment_method = lower(p_payment_method),
    remarks              = CASE WHEN trim(coalesce(p_remarks, '')) = '' THEN remarks ELSE p_remarks END,
    updated_at           = v_now
  WHERE id = p_order_id;

  INSERT INTO public.advance_order_timeline(
    advance_order_id, event_type, label, remarks, created_by, created_at
  ) VALUES
    (p_order_id, 'remaining_payment_received', 'Remaining Payment Received', coalesce(p_remarks, ''), auth.uid(), v_now),
    (p_order_id, 'completed', 'Order Completed', 'Invoice ' || v_invoice || ' generated', auth.uid(), v_now);

  RETURN QUERY SELECT v_order_id, v_invoice, v_now;
END;
$function;

