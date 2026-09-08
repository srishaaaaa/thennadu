import React, { useState, useEffect, useCallback } from 'react'
import { Receipt, Plus, Trash2, X, AlertTriangle, Download } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatCurrency } from '../lib/retail'

interface ExpenseCategory {
  id: number
  name: string
  is_active: boolean
}

interface Expense {
  id: string
  category_id: number
  amount: number
  expense_date: string
  description: string | null
  receipt_url: string | null
  created_at: string
  expense_categories?: { name: string } | null
}

export default function Expenses() {
  const [tab, setTab] = useState<'expenses'|'categories'>('expenses')
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [categories, setCategories] = useState<ExpenseCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ category_id: '', amount: '', description: '', expense_date: new Date().toISOString().split('T')[0] })
  const [submitting, setSubmitting] = useState(false)
  const [newCatName, setNewCatName] = useState('')
  const [dbError, setDbError] = useState(false)
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')
  const [datePreset, setDatePreset] = useState<'all'|'today'|'week'|'month'|'year'>('all')

  const fetchData = useCallback(async () => {
    setLoading(true)
    setDbError(false)
    try {
      const { data: cats, error: errCats } = await supabase.from('expense_categories').select('*').order('name')
      if (errCats && (errCats.message.includes('does not exist') || errCats.code === '42P01')) {
        setDbError(true)
      } else if (cats) {
        setCategories(cats)
      }

      const { data: exps, error: errExps } = await supabase.from('expenses').select('id, category_id, amount, expense_date, description, receipt_url, created_at, expense_categories(name)').order('expense_date', { ascending: false })
      if (errExps && (errExps.message.includes('does not exist') || errExps.code === '42P01')) {
        setDbError(true)
      } else if (exps) {
        setExpenses(exps as unknown as Expense[])
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void fetchData() }, [fetchData])

  const handleSaveExpense = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.category_id || !form.amount) return
    setSubmitting(true)
    
    try {
      await supabase.from('expenses').insert({
        category_id: parseInt(form.category_id),
        amount: parseFloat(form.amount),
        description: form.description || null,
        expense_date: form.expense_date
      })
      setShowModal(false)
      setForm({ category_id: '', amount: '', description: '', expense_date: new Date().toISOString().split('T')[0] })
      void fetchData()
    } catch (err) {
      console.error(err)
      alert('Failed to save expense')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteExpense = async (id: string) => {
    if (!confirm('Are you sure you want to delete this expense?')) return
    await supabase.from('expenses').delete().eq('id', id)
    void fetchData()
  }

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newCatName.trim()) return
    await supabase.from('expense_categories').insert({ name: newCatName.trim() })
    setNewCatName('')
    void fetchData()
  }

  const toggleCategory = async (cat: ExpenseCategory) => {
    await supabase.from('expense_categories').update({ is_active: !cat.is_active }).eq('id', cat.id)
    void fetchData()
  }

  const handleDeleteCategory = async (cat: ExpenseCategory) => {
    if (!confirm(`Delete category "${cat.name}"? This cannot be undone.`)) return
    await supabase.from('expense_categories').delete().eq('id', cat.id)
    void fetchData()
  }

  const handleExportCSV = () => {
    const rows = [
      ['Date', 'Category', 'Description', 'Amount'],
      ...filteredExpenses.map(exp => [
        new Date(exp.expense_date).toLocaleDateString('en-MY'),
        exp.expense_categories?.name || 'Unknown',
        exp.description || '',
        exp.amount.toFixed(2),
      ])
    ]
    const csv = rows.map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `expenses-${datePreset === 'all' ? 'all-time' : datePreset}-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const now = new Date()
  const todayStr = now.toISOString().split('T')[0]
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const yearStart = `${now.getFullYear()}-01-01`

  const totalToday = expenses.filter(e => e.expense_date.startsWith(todayStr)).reduce((s, e) => s + e.amount, 0)
  const totalWeek = expenses.filter(e => e.expense_date >= oneWeekAgo).reduce((s, e) => s + e.amount, 0)
  const totalMonth = expenses.filter(e => new Date(e.expense_date).getMonth() === now.getMonth() && new Date(e.expense_date).getFullYear() === now.getFullYear()).reduce((s, e) => s + e.amount, 0)
  const totalYear = expenses.filter(e => new Date(e.expense_date).getFullYear() === now.getFullYear()).reduce((s, e) => s + e.amount, 0)
  const totalAll = expenses.reduce((s, e) => s + e.amount, 0)

  const filteredExpenses = expenses.filter(exp => {
    if (!filterFrom && !filterTo) return true
    const d = exp.expense_date
    if (filterFrom && d < filterFrom) return false
    if (filterTo && d > filterTo) return false
    return true
  })

  const applyPreset = (preset: typeof datePreset) => {
    setDatePreset(preset)
    if (preset === 'all') { setFilterFrom(''); setFilterTo('') }
    else if (preset === 'today') { setFilterFrom(todayStr); setFilterTo(todayStr) }
    else if (preset === 'week') { setFilterFrom(oneWeekAgo); setFilterTo(todayStr) }
    else if (preset === 'month') { setFilterFrom(monthStart); setFilterTo(todayStr) }
    else if (preset === 'year') { setFilterFrom(yearStart); setFilterTo(todayStr) }
  }

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-3">
          <Receipt size={24} className="text-[#E87020]" />
          <h2 className="text-[22px] font-black text-[#111111]">Expense Tracker</h2>
        </div>
      </div>

      {dbError && (
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 p-4 rounded-xl flex items-start gap-3">
          <AlertTriangle className="shrink-0 mt-0.5" size={18} />
          <p className="text-sm font-bold">Database tables not set up yet. Please run the SQL migration in your Supabase SQL Editor.</p>
        </div>
      )}

      <div className="flex gap-2 bg-[#F3F4F6] rounded-2xl p-1.5 w-fit">
        <button onClick={() => setTab('expenses')} className={`px-4 py-2 rounded-xl text-sm font-black transition-all ${tab === 'expenses' ? 'bg-[#E87020] text-white shadow-sm' : 'text-[#6B7280] hover:text-[#111111]'}`}>Expenses</button>
        <button onClick={() => setTab('categories')} className={`px-4 py-2 rounded-xl text-sm font-black transition-all ${tab === 'categories' ? 'bg-[#E87020] text-white shadow-sm' : 'text-[#6B7280] hover:text-[#111111]'}`}>Categories</button>
      </div>

      {tab === 'expenses' && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            {[
              { label: 'Today', value: formatCurrency(totalToday), color: 'text-red-600' },
              { label: 'This Week', value: formatCurrency(totalWeek), color: 'text-red-600' },
              { label: 'This Month', value: formatCurrency(totalMonth), color: 'text-red-600' },
              { label: 'This Year', value: formatCurrency(totalYear), color: 'text-red-600' },
              { label: 'Total All Time', value: formatCurrency(totalAll), color: 'text-[#111111]' },
            ].map((c, i) => (
              <div key={i} className="bg-white rounded-2xl border border-[#FDDBB4]/60 p-3 sm:p-4 shadow-sm">
                <p className="text-[10px] font-black uppercase tracking-wider text-[#6B7280] mb-1">{c.label}</p>
                <p className={`text-[16px] xl:text-[20px] font-black ${c.color} truncate`} title={c.value}>{c.value}</p>
              </div>
            ))}
          </div>

          {/* Filter bar */}
          <div className="bg-white rounded-2xl border border-[#FDDBB4]/60 shadow-sm px-4 py-3 flex flex-wrap items-center gap-3">
            {/* FROM date */}
            <div className="flex items-center gap-2 border border-[#E5E7EB] rounded-xl px-3 py-2 bg-[#F9FAFB]">
              <span className="text-[11px] font-black uppercase text-[#6B7280]">From</span>
              <input
                type="date"
                value={filterFrom}
                onChange={e => { setFilterFrom(e.target.value); setDatePreset('all') }}
                className="text-[12px] font-semibold text-[#111111] bg-transparent outline-none"
              />
            </div>
            {/* TO date */}
            <div className="flex items-center gap-2 border border-[#E5E7EB] rounded-xl px-3 py-2 bg-[#F9FAFB]">
              <span className="text-[11px] font-black uppercase text-[#6B7280]">To</span>
              <input
                type="date"
                value={filterTo}
                onChange={e => { setFilterTo(e.target.value); setDatePreset('all') }}
                className="text-[12px] font-semibold text-[#111111] bg-transparent outline-none"
              />
            </div>
            {/* Period presets */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
              <span className="shrink-0 text-[11px] font-black uppercase text-[#6B7280] mr-1">Period</span>
              {([
                { id: 'all' as const, label: 'All Time' },
                { id: 'today' as const, label: 'Today' },
                { id: 'week' as const, label: 'This Week' },
                { id: 'month' as const, label: 'This Month' },
                { id: 'year' as const, label: 'This Year' },
              ]).map(p => (
                <button key={p.id} onClick={() => applyPreset(p.id)}
                  className={`shrink-0 px-3 py-1.5 rounded-full text-[11px] font-black uppercase whitespace-nowrap transition-all ${datePreset === p.id ? 'bg-[#111111] text-white shadow-sm' : 'text-[#6B7280] hover:text-[#111111] border border-[#E5E7EB] bg-white'}`}>
                  {p.label}
                </button>
              ))}
            </div>
            {/* Spacer + Export CSV */}
            <div className="ml-auto flex items-center gap-2">
              <button onClick={handleExportCSV} className="flex items-center gap-2 border border-[#E5E7EB] bg-white text-[#374151] px-3 py-2 rounded-xl text-[12px] font-black hover:bg-[#F9FAFB] transition-colors">
                <Download size={14} /> Export CSV
              </button>
              <button onClick={() => setShowModal(true)} disabled={dbError} className="bg-[#E87020] text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-[#C85C10] disabled:opacity-50">
                <Plus size={16} /> Record Expense
              </button>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-[#FDDBB4]/60 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-[#FAFAFA] border-b border-[#FDDBB4]/60">
                  <tr>
                    <th className="px-4 py-3 text-[11px] font-black uppercase text-[#374151]">Date</th>
                    <th className="px-4 py-3 text-[11px] font-black uppercase text-[#374151]">Category</th>
                    <th className="px-4 py-3 text-[11px] font-black uppercase text-[#374151]">Description</th>
                    <th className="px-4 py-3 text-[11px] font-black uppercase text-[#374151]">Amount</th>
                    <th className="px-4 py-3 text-[11px] font-black uppercase text-[#374151] text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={5} className="text-center p-8 text-[#6B7280] font-bold">Loading...</td></tr>
                  ) : filteredExpenses.length === 0 ? (
                    <tr><td colSpan={5} className="text-center p-8 text-[#6B7280] font-bold">
                      {expenses.length === 0 ? 'No expenses recorded yet.' : 'No expenses in the selected date range.'}
                    </td></tr>
                  ) : filteredExpenses.map(exp => (
                    <tr key={exp.id} className="border-b border-[#FDDBB4]/30 hover:bg-[#FAFAFA]">
                      <td className="px-4 py-3 text-sm font-semibold text-[#111111]">{new Date(exp.expense_date).toLocaleDateString('en-MY')}</td>
                      <td className="px-4 py-3">
                        <span className="bg-[#FFF8F2] text-[#E87020] border border-[#FDDBB4] px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-wider">
                          {exp.expense_categories?.name || 'Unknown'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-[#374151]">{exp.description || '—'}</td>
                      <td className="px-4 py-3 text-sm font-black text-red-600">{formatCurrency(exp.amount)}</td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => handleDeleteExpense(exp.id)} className="text-red-400 hover:text-red-600 p-1.5 bg-red-50 rounded-lg"><Trash2 size={14} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === 'categories' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-2xl shadow-sm border border-[#FDDBB4]/60 p-5">
            <h3 className="text-base font-black text-[#111111] mb-4">Add Category</h3>
            <form onSubmit={handleAddCategory} className="flex gap-2">
              <input type="text" value={newCatName} onChange={e => setNewCatName(e.target.value)} placeholder="e.g. Utility Bills" className="flex-1 border border-[#FDDBB4]/60 p-2.5 rounded-xl text-sm font-bold outline-none focus:border-[#E87020]" required disabled={dbError} />
              <button type="submit" disabled={dbError} className="bg-[#E87020] text-white px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-[#C85C10] disabled:opacity-50">Add</button>
            </form>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-[#FDDBB4]/60 overflow-hidden">
            <table className="w-full text-left">
              <thead className="bg-[#FAFAFA] border-b border-[#FDDBB4]/60">
                <tr>
                  <th className="px-4 py-3 text-[11px] font-black uppercase text-[#374151]">Category Name</th>
                  <th className="px-4 py-3 text-[11px] font-black uppercase text-[#374151] text-center">Status</th>
                  <th className="px-4 py-3 text-[11px] font-black uppercase text-[#374151] text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {categories.length === 0 ? (
                  <tr><td colSpan={3} className="text-center p-6 text-[#6B7280] text-sm font-bold">No categories added.</td></tr>
                ) : categories.map(cat => (
                  <tr key={cat.id} className="border-b border-[#FDDBB4]/30 hover:bg-[#FAFAFA]">
                    <td className="px-4 py-3 font-bold text-[#111111] text-sm">{cat.name}</td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => toggleCategory(cat)} className={`px-3 py-1 text-[10px] font-black uppercase tracking-wider rounded-lg border ${cat.is_active ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-50 text-gray-500 border-gray-200'}`}>
                        {cat.is_active ? 'Active' : 'Inactive'}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => handleDeleteCategory(cat)} className="text-red-400 hover:text-red-600 p-1.5 bg-red-50 hover:bg-red-100 rounded-lg transition-colors" title="Delete category">
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-xl font-black text-[#111111]">Record Expense</h2>
              <button onClick={() => setShowModal(false)} className="p-2 rounded-xl hover:bg-gray-100"><X size={18} /></button>
            </div>
            <form onSubmit={handleSaveExpense} className="space-y-4">
              <div>
                <label className="block text-[10px] font-black uppercase text-[#374151] mb-1.5">Date</label>
                <input type="date" value={form.expense_date} onChange={e => setForm({...form, expense_date: e.target.value})} className="w-full border border-[#FDDBB4]/60 p-2.5 rounded-xl text-sm font-bold outline-none focus:border-[#E87020]" required />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase text-[#374151] mb-1.5">Category</label>
                <select value={form.category_id} onChange={e => setForm({...form, category_id: e.target.value})} className="w-full border border-[#FDDBB4]/60 p-2.5 rounded-xl text-sm font-bold outline-none focus:border-[#E87020] bg-white" required>
                  <option value="">Select Category</option>
                  {categories.filter(c => c.is_active).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase text-[#374151] mb-1.5">Amount (RM)</label>
                <input type="number" step="0.01" min="0" value={form.amount} onChange={e => setForm({...form, amount: e.target.value})} className="w-full border border-[#FDDBB4]/60 p-2.5 rounded-xl text-sm font-bold outline-none focus:border-[#E87020]" required placeholder="0.00" />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase text-[#374151] mb-1.5">Description / Note</label>
                <input type="text" value={form.description} onChange={e => setForm({...form, description: e.target.value})} className="w-full border border-[#FDDBB4]/60 p-2.5 rounded-xl text-sm font-bold outline-none focus:border-[#E87020]" placeholder="Optional details..." />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 bg-gray-100 p-3 rounded-xl font-bold text-sm hover:bg-gray-200">Cancel</button>
                <button type="submit" disabled={submitting} className="flex-1 bg-[#E87020] text-white p-3 rounded-xl font-bold text-sm hover:bg-[#C85C10] disabled:opacity-50">{submitting ? 'Saving...' : 'Save Expense'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
