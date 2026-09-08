-- ==========================================
-- 1. INVENTORY ENHANCEMENTS
-- ==========================================
CREATE TABLE IF NOT EXISTS public.inventory_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id BIGINT REFERENCES public.products(id) ON DELETE CASCADE,
    old_quantity NUMERIC(12,3) NOT NULL,
    new_quantity NUMERIC(12,3) NOT NULL,
    adjustment NUMERIC(12,3) NOT NULL,
    reason TEXT NOT NULL CHECK (reason IN ('sale', 'restock', 'return', 'manual_adjustment', 'loss')),
    reference_id TEXT,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trigger function to automatically deduct stock and log it on order completion
CREATE OR REPLACE FUNCTION public.handle_order_inventory_deduction()
RETURNS TRIGGER AS $function$
DECLARE
    item RECORD;
    current_stock NUMERIC(12,3);
BEGIN
    IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
        FOR item IN SELECT * FROM public.order_items WHERE order_id = NEW.id LOOP
            -- Get current stock
            SELECT stock_quantity INTO current_stock FROM public.products WHERE id = item.product_id;
            
            IF current_stock IS NOT NULL THEN
                -- Update product stock
                UPDATE public.products 
                SET stock_quantity = stock_quantity - item.quantity,
                    updated_at = NOW()
                WHERE id = item.product_id;
                
                -- Insert log
                INSERT INTO public.inventory_logs (product_id, old_quantity, new_quantity, adjustment, reason, reference_id)
                VALUES (
                    item.product_id, 
                    current_stock, 
                    current_stock - item.quantity, 
                    -item.quantity, 
                    'sale', 
                    NEW.id::text
                );
            END IF;
        END LOOP;
    END IF;
    RETURN NEW;
END;
$function$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_order_inventory_deduction ON public.orders;
CREATE TRIGGER trigger_order_inventory_deduction
    AFTER UPDATE OF status ON public.orders
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_order_inventory_deduction();

-- Also handle advance order completion (tailoring/custom) if they contain product items
CREATE OR REPLACE FUNCTION public.handle_advance_order_inventory_deduction()
RETURNS TRIGGER AS $function$
DECLARE
    item RECORD;
    current_stock NUMERIC(12,3);
BEGIN
    IF NEW.status = 'delivered' AND (OLD.status IS NULL OR OLD.status != 'delivered') THEN
        -- Advance orders might have JSON items or separate tables. In this schema, advance_orders has an 'items' JSONB column.
        -- We will extract items that have a product_id.
        FOR item IN 
            SELECT (jsonb_array_elements(NEW.items)->>'product_id')::BIGINT AS product_id,
                   (jsonb_array_elements(NEW.items)->>'quantity')::NUMERIC AS quantity
            WHERE (jsonb_array_elements(NEW.items)->>'product_id') IS NOT NULL
        LOOP
            SELECT stock_quantity INTO current_stock FROM public.products WHERE id = item.product_id;
            
            IF current_stock IS NOT NULL THEN
                UPDATE public.products 
                SET stock_quantity = stock_quantity - item.quantity,
                    updated_at = NOW()
                WHERE id = item.product_id;
                
                INSERT INTO public.inventory_logs (product_id, old_quantity, new_quantity, adjustment, reason, reference_id)
                VALUES (
                    item.product_id, 
                    current_stock, 
                    current_stock - item.quantity, 
                    -item.quantity, 
                    'sale', 
                    NEW.id::text
                );
            END IF;
        END LOOP;
    END IF;
    RETURN NEW;
END;
$function$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_advance_order_inventory_deduction ON public.advance_orders;
CREATE TRIGGER trigger_advance_order_inventory_deduction
    AFTER UPDATE OF status ON public.advance_orders
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_advance_order_inventory_deduction();


-- ==========================================
-- 2. EXPENSES
-- ==========================================
CREATE TABLE IF NOT EXISTS public.expense_categories (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed basic categories
INSERT INTO public.expense_categories (name) VALUES 
('Rent'), ('Utilities'), ('Salaries'), ('Supplies'), ('Marketing'), ('Maintenance'), ('Other')
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id INTEGER REFERENCES public.expense_categories(id) ON DELETE RESTRICT,
    amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
    description TEXT,
    receipt_url TEXT,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==========================================
-- 3. ATTENDANCE & STAFF
-- ==========================================
CREATE TABLE IF NOT EXISTS public.staff (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'Staff',
    phone TEXT,
    base_salary NUMERIC(12,2) DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.attendance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id UUID REFERENCES public.staff(id) ON DELETE CASCADE,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    status TEXT NOT NULL CHECK (status IN ('present', 'absent', 'half-day', 'leave')),
    check_in_time TIMESTAMPTZ,
    notes TEXT,
    marked_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (staff_id, date) -- One attendance record per staff per day
);

-- ==========================================
-- STORAGE & RLS POLICIES
-- ==========================================
-- Assuming 'receipts' bucket needs to be created (Supabase storage.buckets)
INSERT INTO storage.buckets (id, name, public) VALUES ('receipts', 'receipts', false)
ON CONFLICT (id) DO NOTHING;

-- Policies for storage (Allow authenticated users to upload/read)
DROP POLICY IF EXISTS "Authenticated users can upload receipts" ON storage.objects;
CREATE POLICY "Authenticated users can upload receipts" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'receipts');

DROP POLICY IF EXISTS "Authenticated users can read receipts" ON storage.objects;
CREATE POLICY "Authenticated users can read receipts" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'receipts');

-- Enable RLS on new tables
ALTER TABLE public.inventory_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users full access for now (matching existing tables pattern)
CREATE POLICY "Enable read access for all authenticated users" ON public.inventory_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Enable insert access for all authenticated users" ON public.inventory_logs FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Enable read access for all authenticated users" ON public.expense_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "Enable all access for all authenticated users" ON public.expense_categories FOR ALL TO authenticated USING (true);
CREATE POLICY "Enable all access for all authenticated users" ON public.expenses FOR ALL TO authenticated USING (true);
CREATE POLICY "Enable all access for all authenticated users" ON public.staff FOR ALL TO authenticated USING (true);
CREATE POLICY "Enable all access for all authenticated users" ON public.attendance FOR ALL TO authenticated USING (true);
