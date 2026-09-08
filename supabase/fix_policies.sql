-- Allow all authenticated users full access for now (matching existing tables pattern)
DROP POLICY IF EXISTS "Enable read access for all authenticated users" ON public.inventory_logs;
DROP POLICY IF EXISTS "Enable insert access for all authenticated users" ON public.inventory_logs;
DROP POLICY IF EXISTS "Enable read access for all authenticated users" ON public.expense_categories;
DROP POLICY IF EXISTS "Enable all access for all authenticated users" ON public.expense_categories;
DROP POLICY IF EXISTS "Enable all access for all authenticated users" ON public.expenses;
DROP POLICY IF EXISTS "Enable all access for all authenticated users" ON public.staff;
DROP POLICY IF EXISTS "Enable all access for all authenticated users" ON public.attendance;

CREATE POLICY "Enable all access for inventory_logs" ON public.inventory_logs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all access for expense_categories" ON public.expense_categories FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all access for expenses" ON public.expenses FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all access for staff" ON public.staff FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all access for attendance" ON public.attendance FOR ALL USING (true) WITH CHECK (true);
