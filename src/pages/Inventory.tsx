import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Package, Search, AlertTriangle, X, RefreshCw, Edit2, Plus, Trash2, Download,
  TrendingUp, PieChart, Layers, Box, Wallet, RotateCcw, Minus, Target, History,
  SlidersHorizontal, ArrowUpRight, ArrowDownRight, Tag, BarChart3, CheckCircle2, Clock,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatCurrency } from '../lib/retail'
import { useSound } from '../context/SoundContext'
import { BRAND_EN } from '../lib/brand'

const PRIMARY = '#E87020'
const PRIMARY_DARK = '#C85C10'
const PRIMARY_SUBTLE = 'rgba(255,255,255,0.85)'

interface InventoryProduct {
  id: string | number
  name: string
  category: string
  stock_quantity: number
  low_stock_alert: number
  price: number
  purchase_price?: number
  description?: string
  is_active: boolean
  updated_at: string
  image_url?: string
  item_type?: 'product' | 'service'
}

interface Category {
  id: string | number
  name_en: string
  name_ta?: string
  is_active: boolean
  sort_order?: number
}

type AdjustType = 'restock' | 'return' | 'loss' | 'reconciliation'

interface AdjustModal {
  product: InventoryProduct
  adjustType: AdjustType
  qty: string
  note: string
}

interface ProductForm {
  name: string
  category: string
  price: string
  purchase_price: string
  stock_quantity: string
  low_stock_alert: string
  description: string
  is_active: boolean
  item_type: 'product' | 'service'
}

const EMPTY_FORM: ProductForm = {
  name: '',
  category: '',
  price: '',
  purchase_price: '',
  stock_quantity: '0',
  low_stock_alert: '5',
  description: '',
  is_active: true,
  item_type: 'product',
}

const getErrorMessage = (err: unknown, fallback: string) => {
  if (err instanceof Error) return err.message
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message
  }
  return fallback
}

const getStatus = (p: InventoryProduct) => {
  if (p.stock_quantity <= 0) return 'out'
  if (p.stock_quantity <= (p.low_stock_alert || 5)) return 'low'
  return 'ok'
}

interface InventoryLog {
  id: string
  product_id: string | number
  old_quantity: number
  new_quantity: number
  adjustment: number
  reason: string
  reference_id?: string
  created_at: string
  products?: { name: string; category: string }
}

const REASON_LABEL: Record<string, string> = {
  restock: 'Restock',
  sale: 'Sale (POS)',
  return: 'Return',
  loss: 'Loss / Damaged',
  manual_adjustment: 'Reconciliation',
}

const REASON_BADGE: Record<string, string> = {
  restock: 'bg-emerald-100 text-emerald-700',
  sale: 'bg-blue-100 text-blue-700',
  return: 'bg-purple-100 text-purple-700',
  loss: 'bg-red-100 text-red-700',
  manual_adjustment: 'bg-amber-100 text-amber-700',
}

const ADJUST_TYPES: { key: AdjustType; label: string; sub: string; icon: React.ElementType; color: string }[] = [
  { key: 'restock', label: 'Restock', sub: '+ Add Units', icon: Plus, color: 'emerald' },
  { key: 'return', label: 'Customer Return', sub: '+ Add Units', icon: RotateCcw, color: 'purple' },
  { key: 'loss', label: 'Loss / Damaged', sub: '− Deduct Units', icon: Minus, color: 'red' },
  { key: 'reconciliation', label: 'Reconciliation', sub: 'Set Exact Count', icon: Target, color: 'blue' },
]

const ADJUST_COLOR_CLASSES: Record<string, { border: string; bg: string; iconBg: string; iconText: string; text: string }> = {
  emerald: { border: 'border-emerald-500', bg: 'bg-emerald-50', iconBg: 'bg-emerald-500', iconText: 'text-white', text: 'text-emerald-700' },
  purple: { border: 'border-purple-500', bg: 'bg-purple-50', iconBg: 'bg-purple-500', iconText: 'text-white', text: 'text-purple-700' },
  red: { border: 'border-red-500', bg: 'bg-red-50', iconBg: 'bg-red-500', iconText: 'text-white', text: 'text-red-700' },
  blue: { border: 'border-blue-500', bg: 'bg-blue-50', iconBg: 'bg-blue-500', iconText: 'text-white', text: 'text-blue-700' },
}

const reasonForType = (t: AdjustType) => t === 'restock' ? 'restock' : t === 'return' ? 'return' : t === 'loss' ? 'loss' : 'manual_adjustment'

type DatePreset = 'all' | 'today' | 'week' | 'month' | 'custom'

function InventoryAnalytics({ products, categories }: { products: InventoryProduct[]; categories: Category[] }) {
  const [datePreset, setDatePreset] = useState<DatePreset>('week')
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 7); return d.toISOString().split('T')[0]
  })
  const [toDate, setToDate] = useState(() => new Date().toISOString().split('T')[0])
  const [logs, setLogs] = useState<InventoryLog[]>([])
  const [loadingLogs, setLoadingLogs] = useState(false)
  const [ledgerSearch, setLedgerSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')

  const applyPreset = (preset: DatePreset) => {
    setDatePreset(preset)
    const now = new Date()
    const today = now.toISOString().split('T')[0]
    if (preset === 'all') { setFromDate('2000-01-01'); setToDate(today) }
    else if (preset === 'today') { setFromDate(today); setToDate(today) }
    else if (preset === 'week') { const d = new Date(); d.setDate(d.getDate() - 7); setFromDate(d.toISOString().split('T')[0]); setToDate(today) }
    else if (preset === 'month') { const d = new Date(); d.setDate(1); setFromDate(d.toISOString().split('T')[0]); setToDate(today) }
  }

  useEffect(() => {
    const fetchLogs = async () => {
      setLoadingLogs(true)
      const from = new Date(fromDate + 'T00:00:00').toISOString()
      const to = new Date(toDate + 'T23:59:59').toISOString()
      const { data } = await supabase
        .from('inventory_logs')
        .select('*, products(name, category)')
        .gte('created_at', from)
        .lte('created_at', to)
        .order('created_at', { ascending: false })
      setLogs((data as InventoryLog[]) || [])
      setLoadingLogs(false)
    }
    void fetchLogs()
  }, [fromDate, toDate])

  const incoming = logs.filter(l => l.adjustment > 0).reduce((s, l) => s + l.adjustment, 0)
  const sold = logs.filter(l => l.reason === 'sale').reduce((s, l) => s + Math.abs(l.adjustment), 0)
  const lost = logs.filter(l => l.reason === 'loss').reduce((s, l) => s + Math.abs(l.adjustment), 0)
  const netDelta = logs.reduce((s, l) => s + l.adjustment, 0)

  const filteredLogs = logs.filter(l => {
    if (typeFilter !== 'all' && l.reason !== typeFilter) return false
    if (!ledgerSearch.trim()) return true
    const q = ledgerSearch.toLowerCase()
    return (l.products?.name || '').toLowerCase().includes(q) || (l.products?.category || '').toLowerCase().includes(q)
  })

  const downloadSnapshotCSV = () => {
    const headers = ['ID', 'Product Name', 'Category', 'Stock Quantity', 'Low Stock Alert', 'Price', 'Purchase Price', 'Status', 'Last Updated Date', 'Last Updated Time']
    const rows = products.map(p => {
      const status = p.stock_quantity <= 0 ? 'Out of Stock' : p.stock_quantity <= p.low_stock_alert ? 'Low Stock' : 'In Stock'
      const updatedAt = new Date(p.updated_at)
      return [
        p.id, `"${p.name.replace(/"/g, '""')}"`, `"${(p.category || '').replace(/"/g, '""')}"`,
        p.stock_quantity, p.low_stock_alert, p.price, p.purchase_price || 0, status,
        updatedAt.toLocaleDateString('en-MY'), updatedAt.toLocaleTimeString('en-MY')
      ].join(',')
    })
    const csvContent = [headers.join(','), ...rows].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.setAttribute('download', `inventory_snapshot_${new Date().toISOString().split('T')[0]}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const downloadMovementsCSV = () => {
    const headers = ['Date', 'Time', 'Type', 'Product', 'Category', 'Qty Delta', 'Before', 'After', 'Notes']
    const rows = filteredLogs.map(l => [
      new Date(l.created_at).toLocaleDateString('en-MY'),
      new Date(l.created_at).toLocaleTimeString('en-MY'),
      REASON_LABEL[l.reason] || l.reason,
      `"${(l.products?.name || '').replace(/"/g, '""')}"`,
      `"${(l.products?.category || '').replace(/"/g, '""')}"`,
      l.adjustment, l.old_quantity, l.new_quantity,
      `"${(l.reference_id || '').replace(/"/g, '""')}"`,
    ].join(','))
    const csvContent = [headers.join(','), ...rows].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.setAttribute('download', `inventory_movements_${new Date().toISOString().split('T')[0]}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className="space-y-5">
      {/* Filters + Export */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-[#EEEBE3] flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {(['all', 'today', 'week', 'month', 'custom'] as DatePreset[]).map(p => (
            <button key={p} onClick={() => applyPreset(p)}
              className={`px-3 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-colors ${datePreset === p ? 'text-white' : 'bg-white border border-[#EEEBE3] text-[#374151] hover:bg-[#FAFAF7]'}`}
              style={datePreset === p ? { background: PRIMARY } : undefined}>
              {p === 'all' ? 'All Time' : p === 'today' ? 'Today' : p === 'week' ? 'This Week' : p === 'month' ? 'This Month' : 'Custom'}
            </button>
          ))}
          <button onClick={() => applyPreset(datePreset)} className="w-9 h-9 flex items-center justify-center rounded-xl border border-[#EEEBE3] text-[#6B7280] hover:bg-[#FAFAF7]">
            <RefreshCw size={14} />
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={downloadSnapshotCSV} className="flex items-center gap-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 px-4 py-2 rounded-xl font-black text-xs uppercase tracking-wider transition-colors">
            <Download size={14} /> Export Snapshot CSV
          </button>
          <button onClick={downloadMovementsCSV} className="flex items-center gap-2 text-white px-4 py-2 rounded-xl font-black text-xs uppercase tracking-wider hover:opacity-90" style={{ background: PRIMARY }}>
            <Download size={14} /> Export Movements CSV
          </button>
        </div>
      </div>

      {datePreset === 'custom' && (
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-[#EEEBE3] flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-2">
            <label className="text-[10px] font-black uppercase text-[#6B7280]">From</label>
            <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
              className="border border-[#EEEBE3] rounded-lg px-3 py-1.5 text-sm font-bold outline-none focus:border-[#E87020]" />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[10px] font-black uppercase text-[#6B7280]">To</label>
            <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
              className="border border-[#EEEBE3] rounded-lg px-3 py-1.5 text-sm font-bold outline-none focus:border-[#E87020]" />
          </div>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Incoming Stock', value: `${incoming > 0 ? '+' : ''}${incoming} Units`, icon: Box, iconBg: 'bg-emerald-50', iconText: 'text-emerald-600' },
          { label: 'Units Sold (POS)', value: `${sold} Units`, icon: Package, iconBg: 'bg-purple-50', iconText: 'text-purple-600' },
          { label: 'Lost / Damaged', value: `${lost} Units`, icon: AlertTriangle, iconBg: 'bg-red-50', iconText: 'text-red-600' },
          { label: 'Net Stock Delta', value: `${netDelta > 0 ? '+' : ''}${netDelta} Units`, icon: TrendingUp, iconBg: 'bg-[#E87020]', iconText: 'text-white' },
        ].map(c => (
          <div key={c.label} className="bg-white rounded-2xl border border-[#EEEBE3] p-4 shadow-sm">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${c.iconBg}`}>
              <c.icon size={16} className={c.iconText} />
            </div>
            <p className="text-[10px] font-black uppercase tracking-wider text-[#6B7280] mb-1">{c.label}</p>
            <p className="text-xl font-black text-[#111111]">{c.value}</p>
          </div>
        ))}
      </div>

      {/* Movement Audit Ledger */}
      <div className="bg-white rounded-2xl shadow-sm border border-[#EEEBE3] overflow-hidden">
        <div className="px-5 py-4 border-b border-[#EEEBE3] flex flex-wrap items-center justify-between gap-3">
          <h4 className="font-black text-sm uppercase tracking-wider text-[#374151]">Movement Audit Ledger ({filteredLogs.length})</h4>
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[160px]">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
              <input value={ledgerSearch} onChange={e => setLedgerSearch(e.target.value)} placeholder="Search ledger..."
                className="w-full pl-8 pr-3 py-2 bg-[#FAFAF7] border border-[#EEEBE3] rounded-xl text-xs font-bold outline-none focus:border-[#E87020]" />
            </div>
            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
              className="px-3 py-2 bg-[#FAFAF7] border border-[#EEEBE3] rounded-xl text-xs font-bold outline-none focus:border-[#E87020]">
              <option value="all">All Types</option>
              {Object.entries(REASON_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
        </div>
        {loadingLogs ? (
          <p className="text-center py-10 text-sm font-bold text-[#6B7280]">Loading...</p>
        ) : filteredLogs.length === 0 ? (
          <p className="text-center py-10 text-sm font-bold text-[#9CA3AF]">No stock movements in this date range.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-[#FAFAF7] text-[10px] font-black uppercase tracking-wider text-[#6B7280]">
                <tr>{['Date & Time', 'Type', 'Product', 'Category', 'Qty Delta', 'Before → After', 'User', 'Notes'].map(h => <th key={h} className="px-4 py-3 text-left whitespace-nowrap">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-[#F0EEE9]">
                {filteredLogs.map(log => (
                  <tr key={log.id} className="hover:bg-[#FAFAF7]">
                    <td className="px-4 py-3 text-[11px] text-[#6B7280] whitespace-nowrap">{new Date(log.created_at).toLocaleDateString('en-MY')} <span className="opacity-70">{new Date(log.created_at).toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' })}</span></td>
                    <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-lg text-[10px] font-black uppercase whitespace-nowrap ${REASON_BADGE[log.reason] || 'bg-gray-100 text-gray-600'}`}>{REASON_LABEL[log.reason] || log.reason}</span></td>
                    <td className="px-4 py-3 font-bold text-[#111111] max-w-[140px] truncate">{log.products?.name || '—'}</td>
                    <td className="px-4 py-3 text-[#6B7280] text-xs">{log.products?.category || '—'}</td>
                    <td className={`px-4 py-3 font-black ${log.adjustment > 0 ? 'text-emerald-600' : 'text-red-600'}`}>{log.adjustment > 0 ? '+' : ''}{log.adjustment}</td>
                    <td className="px-4 py-3 font-bold text-[#374151] whitespace-nowrap">{log.old_quantity} → {log.new_quantity}</td>
                    <td className="px-4 py-3 text-[#6B7280] text-xs">Admin</td>
                    <td className="px-4 py-3 text-[#9CA3AF] text-xs max-w-[160px] truncate">{log.reference_id || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Static Analytics */}
      <div className="grid md:grid-cols-2 gap-5">
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-[#EEEBE3]">
          <h4 className="font-black text-sm uppercase tracking-wider text-[#374151] mb-4 flex items-center gap-2">
            <TrendingUp size={16} className="text-emerald-500" /> Highest Stock Value (Current)
          </h4>
          <div className="space-y-3">
            {products.filter(p => p.stock_quantity > 0)
              .sort((a, b) => (b.stock_quantity * b.price) - (a.stock_quantity * a.price))
              .slice(0, 5).map((p, i) => (
                <div key={p.id} className="flex justify-between items-center p-3 rounded-xl bg-[#FAFAF7] border border-[#F0EEE9]">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="shrink-0 w-6 h-6 flex items-center justify-center rounded-full bg-white font-black text-xs text-slate-400 shadow-sm">{i + 1}</span>
                    <div className="min-w-0">
                      <p className="font-bold text-sm text-slate-800 truncate">{p.name}</p>
                      <p className="text-[10px] text-slate-500 truncate">{p.stock_quantity} units • {formatCurrency(p.price)}/unit</p>
                    </div>
                  </div>
                  <p className="font-black text-emerald-600 shrink-0 ml-2">{formatCurrency(p.stock_quantity * p.price)}</p>
                </div>
            ))}
            {products.filter(p => p.stock_quantity > 0).length === 0 && <p className="text-sm text-slate-400 text-center py-4">No data.</p>}
          </div>
        </div>
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-[#EEEBE3]">
          <h4 className="font-black text-sm uppercase tracking-wider text-[#374151] mb-4 flex items-center gap-2">
            <PieChart size={16} className="text-purple-500" /> Stock by Category (Current)
          </h4>
          <div className="space-y-3">
            {Object.entries(products.reduce((acc, p) => {
              const cat = p.category || 'Uncategorised'
              acc[cat] = (acc[cat] || 0) + p.stock_quantity
              return acc
            }, {} as Record<string, number>)).sort((a, b) => b[1] - a[1]).map(([cat, qty], i) => (
              <div key={cat} className="flex justify-between items-center p-3 rounded-xl bg-[#FAFAF7] border border-[#F0EEE9]">
                <div className="flex items-center gap-3">
                  <div className={`shrink-0 w-3 h-3 rounded-full ${['bg-orange-500', 'bg-emerald-500', 'bg-blue-500', 'bg-purple-500', 'bg-pink-500'][i % 5]}`} />
                  <p className="font-bold text-sm text-slate-800">{cat}</p>
                </div>
                <p className="font-black text-slate-600 shrink-0"><span className="text-purple-600">{qty}</span> items</p>
              </div>
            ))}
            {categories.length === 0 && products.length === 0 && <p className="text-sm text-slate-400 text-center py-4">No data.</p>}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Inventory() {
  const { play } = useSound()
  const [activeTab, setActiveTab] = useState<'stock' | 'products' | 'categories' | 'analytics'>('stock')

  // Stock state
  const [products, setProducts] = useState<InventoryProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'ok' | 'low' | 'out'>('all')
  const [adjustModal, setAdjustModal] = useState<AdjustModal | null>(null)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')

  // Ledger modal state
  const [ledgerProduct, setLedgerProduct] = useState<InventoryProduct | null>(null)
  const [ledgerLogs, setLedgerLogs] = useState<InventoryLog[]>([])
  const [loadingLedger, setLoadingLedger] = useState(false)

  // Product form state
  const [productForm, setProductForm] = useState<ProductForm>(EMPTY_FORM)
  const [editingProduct, setEditingProduct] = useState<InventoryProduct | null>(null)
  const [savingProduct, setSavingProduct] = useState(false)
  const [productNotice, setProductNotice] = useState('')
  const [catalogSearch, setCatalogSearch] = useState('')

  // Category state
  const [categories, setCategories] = useState<Category[]>([])
  const [newCatName, setNewCatName] = useState('')
  const [editingCat, setEditingCat] = useState<Category | null>(null)
  const [editingCatName, setEditingCatName] = useState('')
  const [savingCat, setSavingCat] = useState(false)
  const [catNotice, setCatNotice] = useState('')

  const fetchProducts = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('products')
      .select('id, name, category, stock_quantity, low_stock_alert, price, purchase_price, description, is_active, updated_at, image_url, item_type')
      .order('name')
    if (!error && data) setProducts(data as InventoryProduct[])
    setLoading(false)
  }, [])

  const fetchCategories = useCallback(async () => {
    const { data } = await supabase.from('categories').select('*').order('sort_order').order('name_en')
    if (data) setCategories(data as Category[])
  }, [])

  useEffect(() => {
    void fetchProducts()
    void fetchCategories()
  }, [fetchProducts, fetchCategories])

  // ── Stock Management ──────────────────────────────────────────────
  const filtered = products.filter(p => {
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase()) || (p.category || '').toLowerCase().includes(search.toLowerCase())
    const status = getStatus(p)
    if (filter === 'all') return matchSearch
    return matchSearch && status === filter
  })

  const okCount = products.filter(p => getStatus(p) === 'ok').length
  const lowCount = products.filter(p => getStatus(p) === 'low').length
  const outCount = products.filter(p => getStatus(p) === 'out').length
  const stockValue = products.reduce((s, p) => s + (p.stock_quantity * p.price), 0)
  const totalStock = products.reduce((s, p) => s + p.stock_quantity, 0)

  const openAdjust = (product: InventoryProduct) => {
    const status = getStatus(product)
    if (status === 'low' || status === 'out') play('alert')
    setAdjustModal({ product, adjustType: 'restock', qty: '1', note: '' })
    setNotice('')
  }

  const adjustPreview = useMemo(() => {
    if (!adjustModal) return null
    const n = parseFloat(adjustModal.qty)
    if (isNaN(n)) return null
    const current = adjustModal.product.stock_quantity
    if (adjustModal.adjustType === 'reconciliation') return { newStock: Math.max(0, n), delta: Math.max(0, n) - current }
    if (adjustModal.adjustType === 'loss') return { newStock: Math.max(0, current - n), delta: -Math.min(n, current) }
    return { newStock: current + n, delta: n }
  }, [adjustModal])

  const openLedger = async (product: InventoryProduct) => {
    setLedgerProduct(product)
    setLoadingLedger(true)
    const { data } = await supabase
      .from('inventory_logs')
      .select('*, products(name, category)')
      .eq('product_id', product.id)
      .order('created_at', { ascending: false })
      .limit(50)
    setLedgerLogs((data as InventoryLog[]) || [])
    setLoadingLedger(false)
  }

  const saveAdjust = async () => {
    if (!adjustModal || !adjustPreview) { setNotice('Please enter a valid quantity.'); return }
    const { product, adjustType, note } = adjustModal
    const newQtyNum = adjustPreview.newStock
    if (isNaN(newQtyNum) || newQtyNum < 0) { setNotice('Please enter a valid quantity.'); return }
    setSaving(true)
    try {
      const { error: updateErr } = await supabase
        .from('products')
        .update({ stock_quantity: newQtyNum, updated_at: new Date().toISOString() })
        .eq('id', product.id)
      if (updateErr) throw updateErr

      const { error: logErr } = await supabase.from('inventory_logs').insert({
        product_id: product.id,
        old_quantity: product.stock_quantity,
        new_quantity: newQtyNum,
        adjustment: newQtyNum - product.stock_quantity,
        reason: reasonForType(adjustType),
        reference_id: note || null,
      })
      if (logErr) throw logErr

      play('success')
      setAdjustModal(null)
      void fetchProducts()
    } catch (err: unknown) {
      setNotice(getErrorMessage(err, 'Failed to update stock'))
      play('error')
    } finally {
      setSaving(false)
    }
  }

  // ── Product Management ──────────────────────────────────────────────
  const startEditProduct = (p: InventoryProduct) => {
    setEditingProduct(p)
    setProductForm({
      name: p.name,
      category: p.category || '',
      price: String(p.price),
      purchase_price: String(p.purchase_price || ''),
      stock_quantity: String(p.stock_quantity),
      low_stock_alert: String(p.low_stock_alert || 5),
      description: p.description || '',
      is_active: p.is_active,
      item_type: p.item_type === 'service' ? 'service' : 'product',
    })
    setProductNotice('')
    setActiveTab('products')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const resetProductForm = () => {
    setEditingProduct(null)
    setProductForm(EMPTY_FORM)
    setProductNotice('')
  }

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!productForm.name.trim() || !productForm.price) {
      setProductNotice('Product name and price are required.')
      return
    }
    setSavingProduct(true)
    setProductNotice('')
    try {
      const payload = {
        name: productForm.name.trim(),
        category: productForm.category.trim() || null,
        price: parseFloat(productForm.price) || 0,
        purchase_price: productForm.purchase_price ? parseFloat(productForm.purchase_price) : 0,
        stock_quantity: parseFloat(productForm.stock_quantity) || 0,
        low_stock_alert: parseInt(productForm.low_stock_alert) || 5,
        description: productForm.description.trim(),
        is_active: productForm.is_active,
        item_type: productForm.item_type,
        updated_at: new Date().toISOString(),
      }
      if (editingProduct) {
        const { error } = await supabase.from('products').update(payload).eq('id', editingProduct.id)
        if (error) throw error
        setProductNotice('Product updated successfully!')
      } else {
        const { error } = await supabase.from('products').insert(payload)
        if (error) throw error
        setProductNotice('Product added successfully!')
        setProductForm(EMPTY_FORM)
      }
      play('success')
      void fetchProducts()
    } catch (err: unknown) {
      console.error('Save product error:', err)
      setProductNotice(`Failed to save: ${getErrorMessage(err, JSON.stringify(err))}`)
      play('error')
    } finally {
      setSavingProduct(false)
    }
  }

  const handleDeleteProduct = async (p: InventoryProduct) => {
    if (!confirm(`Delete "${p.name}"? This cannot be undone.`)) return
    await supabase.from('products').delete().eq('id', p.id)
    void fetchProducts()
    if (editingProduct?.id === p.id) resetProductForm()
  }

  // ── Category Management ──────────────────────────────────────────────
  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newCatName.trim()) return
    setSavingCat(true)
    try {
      const maxOrder = categories.reduce((m, c) => Math.max(m, c.sort_order || 0), 0)
      await supabase.from('categories').insert({ name_en: newCatName.trim(), name_ta: '', is_active: true, sort_order: maxOrder + 1 })
      setNewCatName('')
      setCatNotice('Category added!')
      void fetchCategories()
      play('success')
    } catch (err: unknown) {
      setCatNotice(getErrorMessage(err, 'Failed to add category'))
    } finally {
      setSavingCat(false)
      setTimeout(() => setCatNotice(''), 3000)
    }
  }

  const handleSaveEditCat = async (cat: Category) => {
    if (!editingCatName.trim()) return
    await supabase.from('categories').update({ name_en: editingCatName.trim() }).eq('id', cat.id)
    setEditingCat(null)
    void fetchCategories()
  }

  const handleDeleteCat = async (cat: Category) => {
    if (!confirm(`Delete category "${cat.name_en}"?`)) return
    await supabase.from('categories').delete().eq('id', cat.id)
    void fetchCategories()
  }

  const handleToggleCat = async (cat: Category) => {
    await supabase.from('categories').update({ is_active: !cat.is_active }).eq('id', cat.id)
    void fetchCategories()
  }

  const TABS: { key: typeof activeTab; label: string; icon: React.ElementType }[] = [
    { key: 'stock', label: 'Stock Management', icon: Package },
    { key: 'products', label: 'Add / Edit Products', icon: Layers },
    { key: 'categories', label: 'Categories', icon: Tag },
    { key: 'analytics', label: 'Analytics & Reports', icon: BarChart3 },
  ]

  const adjustColor = adjustModal ? ADJUST_COLOR_CLASSES[ADJUST_TYPES.find(t => t.key === adjustModal.adjustType)!.color] : null

  return (
    <div className="p-4 sm:p-6 space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-black text-[#111111] flex items-center gap-2">
          <Package size={24} style={{ color: PRIMARY }} /> Inventory &amp; Products
        </h1>
        <button onClick={() => { void fetchProducts(); void fetchCategories() }} className="flex items-center gap-2 bg-white border border-[#EEEBE3] px-4 py-2 rounded-xl text-sm font-bold text-[#374151] hover:bg-[#FAFAF7]">
          <RefreshCw size={15} /> Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5 bg-white border border-[#EEEBE3] rounded-2xl p-2 shadow-sm overflow-x-auto">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-black text-sm transition-colors whitespace-nowrap shrink-0 ${activeTab === t.key ? 'text-white' : 'text-[#374151] hover:bg-[#FAFAF7]'}`}
            style={activeTab === t.key ? { background: PRIMARY } : undefined}>
            <t.icon size={16} className="shrink-0" />
            {t.label}
          </button>
        ))}
      </div>

      {/* ── STOCK MANAGEMENT TAB ── */}
      {activeTab === 'stock' && (
        <div className="space-y-5">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Total SKUs', value: products.length, icon: Layers, iconBg: '', iconText: 'text-white', bgStyle: { background: PRIMARY } },
              { label: 'Total Stock', value: `${totalStock} Units`, icon: Box, iconBg: 'bg-emerald-50', iconText: 'text-emerald-600' },
              { label: 'Low Stock Items', value: lowCount, icon: AlertTriangle, iconBg: 'bg-amber-50', iconText: 'text-amber-600' },
              { label: 'Stock Valuation', value: formatCurrency(stockValue), icon: Wallet, iconBg: 'bg-orange-50', iconText: 'text-orange-600' },
            ].map((card, i) => (
              <div key={i} className="rounded-2xl border border-[#EEEBE3] p-4 shadow-sm bg-white">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${card.iconBg}`} style={card.bgStyle}>
                  <card.icon size={16} className={card.iconText} />
                </div>
                <p className="text-[10px] font-black uppercase tracking-wider text-[#6B7280] mb-1">{card.label}</p>
                <p className="text-2xl font-black text-[#111111]">{card.value}</p>
              </div>
            ))}
          </div>

          {/* Search */}
          <div className="relative">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search SKU name, category..."
              className="w-full pl-10 pr-4 py-3 bg-white border border-[#EEEBE3] rounded-2xl text-sm font-bold outline-none focus:border-[#E87020]" />
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            {([
              ['all', `All (${products.length})`],
              ['ok', `In Stock (${okCount})`],
              ['low', `Low Stock (${lowCount})`],
              ['out', `Out of Stock (${outCount})`],
            ] as const).map(([key, label]) => {
              const activeClass = key === 'ok' ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                : key === 'low' ? 'bg-amber-100 text-amber-700 border border-amber-200'
                : key === 'out' ? 'bg-red-100 text-red-700 border border-red-200'
                : 'text-white border border-transparent'
              const isActive = key === filter
              return (
                <button key={key} onClick={() => setFilter(key)}
                  className={`px-4 py-2 rounded-xl text-xs font-black tracking-wide ${isActive ? activeClass : 'bg-white border border-[#EEEBE3] text-[#374151] hover:bg-[#FAFAF7]'}`}
                  style={isActive && key === 'all' ? { background: PRIMARY } : undefined}>
                  {label}
                </button>
              )
            })}
            <button onClick={() => { setSearch(''); setFilter('all') }} className="w-9 h-9 flex items-center justify-center rounded-xl border border-[#EEEBE3] text-[#6B7280] hover:bg-[#FAFAF7]">
              <RefreshCw size={14} />
            </button>
          </div>

          {/* Table */}
          <div className="bg-white rounded-2xl border border-[#EEEBE3] shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-[#FAFAF7] border-b border-[#EEEBE3]">
                  <tr>
                    {['Product', 'Category', 'Stock Level', 'Alert At', 'Selling Price', 'Actions'].map(h => (
                      <th key={h} className="px-4 py-3 text-[11px] font-black uppercase tracking-wider text-[#374151] whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={6} className="text-center py-12 text-[#6B7280] font-bold">Loading inventory...</td></tr>
                  ) : filtered.length === 0 ? (
                    <tr><td colSpan={6} className="text-center py-12 text-[#6B7280] font-bold">No products found.</td></tr>
                  ) : filtered.map(p => {
                    const status = getStatus(p)
                    const pillClass = status === 'out' ? 'bg-red-100 text-red-700' : status === 'low' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                    return (
                      <tr key={String(p.id)} className="border-b border-[#F0EEE9] hover:bg-[#FAFAF7]">
                        <td className="px-4 py-3 font-bold text-[#111111] text-sm">{p.name}</td>
                        <td className="px-4 py-3 text-sm text-[#374151]">{p.category || '—'}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-black whitespace-nowrap ${pillClass}`}>
                            {p.stock_quantity} Units
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-[#374151] font-semibold">{p.low_stock_alert || 5}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5 whitespace-nowrap">
                            <span className="text-sm font-black text-[#111111]">{formatCurrency(p.price)}</span>
                            <button onClick={() => startEditProduct(p)} className="text-[#9CA3AF] hover:text-[#111111]"><Edit2 size={12} /></button>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <button onClick={() => openAdjust(p)}
                              className="flex items-center gap-1 bg-[#FFF8F2] text-[#E87020] border border-[#FDDBB4] px-2.5 py-1.5 rounded-lg text-[11px] font-black hover:bg-orange-50">
                              <RefreshCw size={11} /> Adjust
                            </button>
                            <button onClick={() => void openLedger(p)}
                              className="p-1.5 bg-gray-50 text-gray-500 hover:text-[#111111] hover:bg-gray-100 rounded-lg border border-transparent hover:border-[#EEEBE3]">
                              <History size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── ADD / EDIT PRODUCTS TAB ── */}
      {activeTab === 'products' && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Form */}
          <div className="lg:col-span-2">
            <form onSubmit={handleSaveProduct} className="bg-white rounded-2xl border border-[#EEEBE3] shadow-sm p-6 space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#FFF8F2] flex items-center justify-center shrink-0">
                  <Layers size={18} style={{ color: PRIMARY }} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-black text-[#111111]">{editingProduct ? 'Edit Product' : 'Add New Product to Catalog'}</h3>
                    {editingProduct && (
                      <button type="button" onClick={resetProductForm} className="text-xs text-[#6B7280] hover:text-[#111111] font-bold">
                        + New Product
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-[#9CA3AF]">Set pricing, stock and category for this item.</p>
                </div>
              </div>

              {productNotice && (
                <div className={`p-3 rounded-xl text-sm font-bold text-center ${productNotice.includes('success') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                  {productNotice}
                </div>
              )}

              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-[#374151] mb-1.5">Product Name *</label>
                <input type="text" required value={productForm.name} onChange={e => setProductForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full border border-[#EEEBE3] p-2.5 rounded-xl text-sm font-bold outline-none focus:border-[#E87020]"
                  placeholder="e.g. Salwar Kameez Set" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-[#374151] mb-1.5">Category</label>
                  <select value={productForm.category} onChange={e => setProductForm(f => ({ ...f, category: e.target.value }))}
                    className="w-full border border-[#EEEBE3] p-2.5 rounded-xl text-sm font-bold outline-none focus:border-[#E87020] bg-white">
                    <option value="">Select Category</option>
                    {categories.filter(c => c.is_active).map(c => (
                      <option key={String(c.id)} value={c.name_en}>{c.name_en}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-[#374151] mb-1.5">Low Stock Alert</label>
                  <input type="number" min="0" value={productForm.low_stock_alert} onChange={e => setProductForm(f => ({ ...f, low_stock_alert: e.target.value }))}
                    className="w-full border border-[#EEEBE3] p-2.5 rounded-xl text-sm font-bold outline-none focus:border-[#E87020]" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-[#374151] mb-1.5">Selling Price *</label>
                  <input type="number" required step="0.01" min="0" value={productForm.price} onChange={e => setProductForm(f => ({ ...f, price: e.target.value }))}
                    className="w-full border border-[#EEEBE3] p-2.5 rounded-xl text-sm font-bold outline-none focus:border-[#E87020]"
                    placeholder="0.00" />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-[#374151] mb-1.5">Cost Price</label>
                  <input type="number" step="0.01" min="0" value={productForm.purchase_price} onChange={e => setProductForm(f => ({ ...f, purchase_price: e.target.value }))}
                    className="w-full border border-[#EEEBE3] p-2.5 rounded-xl text-sm font-bold outline-none focus:border-[#E87020]"
                    placeholder="0.00" />
                </div>
                <div>
                  <label className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-emerald-600 mb-1.5"><Box size={11} /> Current Stock</label>
                  <input type="number" min="0" value={productForm.stock_quantity} onChange={e => setProductForm(f => ({ ...f, stock_quantity: e.target.value }))}
                    className="w-full border border-emerald-300 bg-emerald-50/40 p-2.5 rounded-xl text-sm font-bold outline-none focus:border-emerald-500" />
                </div>
              </div>
              <p className="text-[10px] text-[#9CA3AF] -mt-2">Cost price is for your records only — not used in billing.</p>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-[#374151] mb-1.5">Description / Notes (Optional)</label>
                <textarea value={productForm.description} onChange={e => setProductForm(f => ({ ...f, description: e.target.value }))} rows={2}
                  className="w-full border border-[#EEEBE3] p-2.5 rounded-xl text-sm font-bold outline-none focus:border-[#E87020] resize-none"
                  placeholder="Product material, care instructions, or rack location notes..." />
              </div>

              {/* Item Type Toggle */}
              <div className="space-y-2">
                <label className="text-[11px] font-black uppercase tracking-wider text-[#6B7280]">Type</label>
                <div className="flex gap-2">
                  <button type="button"
                    onClick={() => setProductForm(f => ({ ...f, item_type: 'product' }))}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-bold border transition-all ${productForm.item_type === 'product' ? 'bg-blue-500 text-white border-blue-500' : 'bg-white text-[#374151] border-[#EEEBE3] hover:border-blue-300'}`}>
                    📦 Product
                  </button>
                  <button type="button"
                    onClick={() => setProductForm(f => ({ ...f, item_type: 'service' }))}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-bold border transition-all ${productForm.item_type === 'service' ? 'bg-purple-500 text-white border-purple-500' : 'bg-white text-[#374151] border-[#EEEBE3] hover:border-purple-300'}`}>
                    ✂️ Service
                  </button>
                </div>
                <p className="text-[10px] text-[#9CA3AF]">Products = physical items sold. Services = tailoring, stitching, alterations.</p>
              </div>

              <div className="flex items-center gap-3 p-3 bg-[#FAFAF7] rounded-xl border border-[#EEEBE3]">
                <label className="flex items-center gap-2 cursor-pointer select-none text-sm font-bold text-[#374151]">
                  <input type="checkbox" checked={productForm.is_active} onChange={e => setProductForm(f => ({ ...f, is_active: e.target.checked }))}
                    className="w-4 h-4 accent-[#E87020]" />
                  Active (visible in Billing Panel)
                </label>
              </div>

              <div className="flex gap-3">
                <button type="submit" disabled={savingProduct}
                  className="flex-1 text-white p-3 rounded-xl font-bold text-sm hover:opacity-90 disabled:opacity-50" style={{ background: PRIMARY }}>
                  {savingProduct ? 'Saving...' : editingProduct ? 'Update Product' : 'Add Product'}
                </button>
                {editingProduct && (
                  <button type="button" onClick={() => void handleDeleteProduct(editingProduct)}
                    className="px-4 py-3 bg-red-50 text-red-600 border border-red-200 rounded-xl font-bold text-sm hover:bg-red-100">
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            </form>
          </div>

          {/* Product List (right side) */}
          <div className="lg:col-span-3">
            <div className="bg-white rounded-2xl border border-[#EEEBE3] shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-[#EEEBE3] bg-[#FAFAF7] flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-[11px] font-black uppercase tracking-wider text-[#374151] whitespace-nowrap">Product Catalog ({products.length})</h3>
                <div className="relative flex-1 min-w-[160px] max-w-full sm:max-w-[240px]">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
                  <input type="text" value={catalogSearch} onChange={e => setCatalogSearch(e.target.value)} placeholder="Search products..."
                    className="w-full pl-8 pr-4 py-2 bg-white border border-[#EEEBE3] rounded-xl text-sm font-bold outline-none focus:border-[#E87020]" />
                </div>
              </div>
              <div className="overflow-y-auto max-h-[600px] divide-y divide-[#F0EEE9]">
                {products.filter(p => p.name.toLowerCase().includes(catalogSearch.toLowerCase())).map(p => (
                  <div key={String(p.id)} className={`flex items-center justify-between px-4 py-3 hover:bg-[#FAFAF7] ${editingProduct?.id === p.id ? 'bg-orange-50 border-l-4 border-[#E87020]' : ''}`}>
                    <div className="min-w-0">
                      <p className="font-bold text-sm text-[#111111] truncate">{p.name}</p>
                      <p className="text-[11px] text-[#6B7280]">{p.category || 'No category'}</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 ml-2">
                      <div className="text-right">
                        <p className="font-black text-sm text-[#111111]">{formatCurrency(p.price)}</p>
                        <p className={`text-[11px] font-bold ${getStatus(p) === 'out' ? 'text-red-600' : getStatus(p) === 'low' ? 'text-amber-600' : 'text-emerald-600'}`}>Stock: {p.stock_quantity}</p>
                      </div>
                      {!p.is_active && <span className="text-[10px] font-black uppercase text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">Hidden</span>}
                      <button onClick={() => startEditProduct(p)} className="p-1.5 text-[#374151] hover:text-[#111111] hover:bg-gray-100 rounded-lg border border-transparent hover:border-[#EEEBE3]">
                        <Edit2 size={14} />
                      </button>
                      <button onClick={() => void handleDeleteProduct(p)} className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
                {products.length === 0 && <p className="text-center p-6 text-[#6B7280] text-sm font-bold">No products yet.</p>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── CATEGORIES TAB ── */}
      {activeTab === 'categories' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Add Category */}
          <div className="bg-white rounded-2xl shadow-sm border border-[#EEEBE3] p-5">
            <h3 className="text-base font-black text-[#111111] mb-4 flex items-center gap-2"><Plus size={16} style={{ color: PRIMARY }} /> Add Category</h3>
            <form onSubmit={handleAddCategory} className="flex gap-2">
              <input type="text" value={newCatName} onChange={e => setNewCatName(e.target.value)} placeholder="e.g. Blouse, Saree, Lehenga"
                className="flex-1 border border-[#EEEBE3] p-2.5 rounded-xl text-sm font-bold outline-none focus:border-[#E87020]" required />
              <button type="submit" disabled={savingCat}
                className="text-white px-4 py-2.5 rounded-xl text-sm font-bold hover:opacity-90 disabled:opacity-50" style={{ background: PRIMARY }}
                onMouseEnter={e => (e.currentTarget.style.background = PRIMARY_DARK)} onMouseLeave={e => (e.currentTarget.style.background = PRIMARY)}>
                Add
              </button>
            </form>
            {catNotice && <p className="mt-2 text-sm font-bold text-green-600">{catNotice}</p>}
          </div>

          {/* Category List */}
          <div className="bg-white rounded-2xl shadow-sm border border-[#EEEBE3] overflow-hidden">
            <div className="px-4 py-3 bg-[#FAFAF7] border-b border-[#EEEBE3]">
              <h3 className="text-[11px] font-black uppercase tracking-wider text-[#374151]">All Categories ({categories.length})</h3>
            </div>
            {categories.length === 0 ? (
              <p className="text-center p-6 text-[#6B7280] text-sm font-bold">No categories yet.</p>
            ) : (
              <div className="divide-y divide-[#F0EEE9]">
                {categories.map(cat => (
                  <div key={String(cat.id)} className="flex items-center justify-between px-4 py-3">
                    {editingCat?.id === cat.id ? (
                      <div className="flex items-center gap-2 flex-1 mr-2">
                        <input value={editingCatName} onChange={e => setEditingCatName(e.target.value)} autoFocus
                          className="flex-1 border border-[#EEEBE3] p-1.5 rounded-lg text-sm font-bold outline-none focus:border-[#E87020]" />
                        <button onClick={() => void handleSaveEditCat(cat)} className="text-[11px] font-black text-white px-2.5 py-1.5 rounded-lg" style={{ background: PRIMARY }}>Save</button>
                        <button onClick={() => setEditingCat(null)} className="text-[11px] font-black text-[#6B7280] px-2 py-1.5 rounded-lg hover:bg-gray-100">✕</button>
                      </div>
                    ) : (
                      <p className="font-bold text-sm text-[#111111]">{cat.name_en}</p>
                    )}
                    {editingCat?.id !== cat.id && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button onClick={() => { setEditingCat(cat); setEditingCatName(cat.name_en) }} className="p-1.5 text-[#374151] hover:text-[#111111] hover:bg-gray-100 rounded-lg">
                          <Edit2 size={13} />
                        </button>
                        <button onClick={() => void handleToggleCat(cat)} className={`px-2.5 py-1 text-[10px] font-black uppercase tracking-wider rounded-full border ${cat.is_active ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-gray-50 text-gray-500 border-gray-200'}`}>
                          {cat.is_active ? 'Active' : 'Inactive'}
                        </button>
                        <button onClick={() => void handleDeleteCat(cat)} className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── ANALYTICS & REPORTS TAB ── */}
      {activeTab === 'analytics' && <InventoryAnalytics products={products} categories={categories} />}

      {/* ── Adjust Stock Modal ── */}
      {adjustModal && adjustColor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="px-5 py-3.5 flex items-center justify-between gap-2 shrink-0" style={{ background: PRIMARY }}>
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
                  <SlidersHorizontal size={15} className="text-white" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-sm font-black text-white leading-tight">Adjust Inventory Stock ({BRAND_EN})</h2>
                  <p className="text-[10px] font-bold" style={{ color: PRIMARY_SUBTLE }}>Restock, remove stock, or reconcile physical count</p>
                </div>
              </div>
              <button onClick={() => setAdjustModal(null)} className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 shrink-0">
                <X size={15} />
              </button>
            </div>

            <div className="p-4 space-y-2.5">
              {/* Product / Current Stock */}
              <div className="bg-[#FFF8F2] border border-[#FDDBB4] rounded-xl px-3.5 py-2.5 flex justify-between items-center">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-wider" style={{ color: PRIMARY }}>Product</p>
                  <p className="font-black text-[#111111] text-sm leading-tight">{adjustModal.product.name}</p>
                  {adjustModal.product.category && (
                    <span className="inline-block mt-0.5 text-[9px] font-black uppercase bg-[#FDE9C8] px-1.5 py-0.5 rounded-full" style={{ color: PRIMARY }}>{adjustModal.product.category}</span>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-[9px] font-black uppercase tracking-wider text-[#6B7280]">Current Stock</p>
                  <p className="text-xl font-black text-[#111111] leading-tight">{adjustModal.product.stock_quantity} <span className="text-xs font-bold text-[#9CA3AF]">units</span></p>
                </div>
              </div>

              {/* Adjustment Type */}
              <div>
                <label className="block text-[9px] font-black uppercase tracking-wider text-[#374151] mb-1">Select Adjustment Type *</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                  {ADJUST_TYPES.map(t => {
                    const active = adjustModal.adjustType === t.key
                    const c = ADJUST_COLOR_CLASSES[t.color]
                    return (
                      <button key={t.key} type="button"
                        onClick={() => setAdjustModal(m => m ? { ...m, adjustType: t.key, qty: t.key === 'reconciliation' ? String(m.product.stock_quantity) : '1' } : m)}
                        className={`flex flex-col items-center gap-1 p-1.5 rounded-lg border-2 text-center transition-all ${active ? `${c.border} ${c.bg}` : 'border-[#EEEBE3] bg-white hover:border-gray-300'}`}>
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center ${active ? c.iconBg : 'bg-gray-100'}`}>
                          <t.icon size={12} className={active ? c.iconText : 'text-gray-400'} />
                        </div>
                        <p className={`text-[9px] font-black leading-tight ${active ? c.text : 'text-[#374151]'}`}>{t.label}</p>
                        <p className="text-[8px] text-[#9CA3AF] font-bold leading-tight hidden sm:block">{t.sub}</p>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Quantity */}
              <div className={`rounded-xl border-2 p-2.5 ${adjustColor.border} ${adjustColor.bg}`}>
                <label className="block text-[9px] font-black uppercase tracking-wider text-[#374151] mb-1.5">
                  {adjustModal.adjustType === 'reconciliation' ? 'New Exact Stock Count *' : adjustModal.adjustType === 'loss' ? 'Quantity to Deduct (Loss / Damaged) *' : `Quantity to Add (${adjustModal.adjustType === 'restock' ? 'Restock' : 'Return'}) *`}
                </label>
                <div className="flex items-center gap-1.5">
                  <button type="button" onClick={() => setAdjustModal(m => { if (!m) return m; const n = Math.max(0, (parseFloat(m.qty) || 0) - 1); return { ...m, qty: String(n) } })}
                    className="w-9 h-9 shrink-0 flex items-center justify-center rounded-lg border border-[#EEEBE3] bg-white text-[#374151] hover:bg-gray-50 font-black text-lg">−</button>
                  <input type="number" min="0" value={adjustModal.qty} onChange={e => setAdjustModal(m => m ? { ...m, qty: e.target.value } : m)}
                    className={`flex-1 text-center border-2 ${adjustColor.border} bg-white p-1.5 rounded-lg text-base font-black outline-none`} />
                  <button type="button" onClick={() => setAdjustModal(m => { if (!m) return m; const n = (parseFloat(m.qty) || 0) + 1; return { ...m, qty: String(n) } })}
                    className="w-9 h-9 shrink-0 flex items-center justify-center rounded-lg border border-[#EEEBE3] bg-white text-[#374151] hover:bg-gray-50 font-black text-lg">+</button>
                </div>

                {adjustModal.adjustType !== 'reconciliation' && (
                  <div className="flex flex-wrap items-center gap-1 mt-1.5">
                    <span className="text-[9px] font-black uppercase text-[#9CA3AF] mr-0.5">Quick:</span>
                    {[1, 5, 10, 25, 50, 100].map(n => (
                      <button key={n} type="button" onClick={() => setAdjustModal(m => m ? { ...m, qty: String(n) } : m)}
                        className={`px-2 py-0.5 rounded-full text-[10px] font-black border ${String(n) === adjustModal.qty ? `${adjustColor.iconBg} ${adjustColor.iconText} border-transparent` : 'bg-white border-[#EEEBE3] text-[#374151] hover:bg-gray-50'}`}>
                        +{n}
                      </button>
                    ))}
                  </div>
                )}

                {adjustPreview && (
                  <div className="mt-1.5 flex items-center justify-between bg-white/70 rounded-lg px-2.5 py-1.5 border border-white">
                    <p className="text-[11px] font-bold text-[#374151]">
                      Current: <span className="font-black text-[#111111]">{adjustModal.product.stock_quantity}</span> → New: <span className="font-black text-[#111111]">{adjustPreview.newStock}</span>
                    </p>
                    <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full ${adjustPreview.delta >= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                      {adjustPreview.delta >= 0 ? '+' : ''}{adjustPreview.delta}
                    </span>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-[9px] font-black uppercase tracking-wider text-[#374151] mb-1">Adjustment Note / Reason Description (Optional)</label>
                <input type="text" value={adjustModal.note} onChange={e => setAdjustModal(m => m ? { ...m, note: e.target.value } : m)}
                  className="w-full border border-[#EEEBE3] p-2 rounded-lg text-sm font-bold outline-none focus:border-[#E87020]"
                  placeholder="e.g. Received new stock shipment / batch delivery" />
              </div>

              {notice && <p className="text-xs text-red-600 font-bold bg-red-50 p-2 rounded-lg">{notice}</p>}
            </div>

            <div className="flex gap-2.5 px-4 pb-4 pt-3 shrink-0 border-t border-[#F0EEE9]">
              <button type="button" onClick={() => { setAdjustModal(null); setNotice('') }} className="flex-1 bg-gray-100 p-2.5 rounded-xl font-bold text-sm hover:bg-gray-200">Cancel</button>
              <button onClick={() => void saveAdjust()} disabled={saving || !adjustPreview}
                className="flex-1 flex items-center justify-center gap-2 text-white p-2.5 rounded-xl font-bold text-sm hover:opacity-90 disabled:opacity-50" style={{ background: PRIMARY }}>
                <CheckCircle2 size={15} />
                {saving
                  ? 'Saving...'
                  : `Confirm ${ADJUST_TYPES.find(t => t.key === adjustModal.adjustType)!.label} (${adjustModal.adjustType === 'reconciliation' ? '→' : adjustPreview && adjustPreview.delta >= 0 ? '+' : '−'}${adjustModal.adjustType === 'reconciliation' ? adjustPreview?.newStock ?? 0 : Math.abs(parseFloat(adjustModal.qty) || 0)} Units)`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Stock Audit Ledger Modal ── */}
      {ledgerProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
            <div className="px-6 py-5 flex items-center justify-between gap-2 shrink-0" style={{ background: PRIMARY }}>
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
                  <Clock size={16} className="text-white" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-base font-black text-white leading-tight">Stock Audit Ledger</h2>
                  <p className="text-[11px] font-bold" style={{ color: PRIMARY_SUBTLE }}>{BRAND_EN} Immutable History</p>
                </div>
              </div>
              <button onClick={() => setLedgerProduct(null)} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 shrink-0">
                <X size={16} />
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto">
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider" style={{ color: PRIMARY }}>Target Product</p>
                <p className="font-black text-lg text-[#111111]">{ledgerProduct.name}</p>
                {ledgerProduct.category && (
                  <span className="inline-block mt-1 text-[10px] font-black uppercase bg-[#FDE9C8] px-2 py-0.5 rounded-full" style={{ color: PRIMARY }}>{ledgerProduct.category}</span>
                )}
                <p className="text-xs font-bold text-[#6B7280] mt-2">Live Stock: <span className="text-[#111111] font-black">{ledgerProduct.stock_quantity} Units</span></p>
              </div>

              <div className="border-t border-[#F0EEE9] pt-4 space-y-3">
                {loadingLedger ? (
                  <p className="text-center py-8 text-sm font-bold text-[#6B7280]">Loading...</p>
                ) : ledgerLogs.length === 0 ? (
                  <p className="text-center py-8 text-sm font-bold text-[#9CA3AF]">No movements recorded for this product.</p>
                ) : ledgerLogs.map(log => (
                  <div key={log.id} className="border border-[#F0EEE9] rounded-xl p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black uppercase ${REASON_BADGE[log.reason] || 'bg-gray-100 text-gray-600'}`}>{REASON_LABEL[log.reason] || log.reason}</span>
                      <span className="text-[11px] text-[#9CA3AF] font-bold">{new Date(log.created_at).toLocaleDateString('en-MY')} at {new Date(log.created_at).toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        {log.adjustment >= 0 ? <ArrowUpRight size={14} className="text-emerald-600" /> : <ArrowDownRight size={14} className="text-red-600" />}
                        <span className={`font-black ${log.adjustment >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{log.adjustment >= 0 ? '+' : ''}{log.adjustment}</span>
                      </div>
                      <span className="font-black text-[#111111] text-sm">{log.old_quantity} → {log.new_quantity}</span>
                    </div>
                    <p className="text-xs text-[#9CA3AF] bg-[#FAFAF7] rounded-lg px-3 py-2">{log.reference_id || 'No note added'}</p>
                    <p className="text-[11px] font-bold text-[#6B7280]">By: Admin</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
