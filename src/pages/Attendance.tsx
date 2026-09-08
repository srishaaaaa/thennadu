import React, { useState, useEffect, useCallback } from 'react'
import { Users, Calendar, AlertTriangle, Plus, X, Edit2, LogIn, LogOut } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatCurrency } from '../lib/retail'

interface Staff {
  id: string
  name: string
  role: string
  phone: string | null
  base_salary: number
  is_active: boolean
}

interface AttendanceRecord {
  id: string
  staff_id: string
  date: string
  status: string
  clock_in: string | null
  clock_out: string | null
}

function formatTime(ts: string | null) {
  if (!ts) return '—'
  return new Date(ts).toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit', hour12: true })
}

export default function Attendance() {
  const [tab, setTab] = useState<'today'|'staff'|'report'>('today')
  const [staff, setStaff] = useState<Staff[]>([])
  const [attendanceMap, setAttendanceMap] = useState<Record<string, string>>({})
  const [clockMap, setClockMap] = useState<Record<string, { clock_in: string|null; clock_out: string|null }>>({})
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0])
  const [loading, setLoading] = useState(true)
  const [dbError, setDbError] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null)

  const [form, setForm] = useState({ name: '', role: '', phone: '', base_salary: '' })
  const [submitting, setSubmitting] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setDbError(false)
    try {
      const { data: s, error: errS } = await supabase.from('staff').select('*').order('name')
      if (errS && (errS.message.includes('does not exist') || errS.code === '42P01')) {
        setDbError(true); setLoading(false); return
      }
      if (s) setStaff(s as Staff[])

      const { data: a, error: errA } = await supabase.from('attendance').select('*').eq('date', selectedDate)
      if (errA && (errA.message.includes('does not exist') || errA.code === '42P01')) {
        setDbError(true)
      } else if (a) {
        const statusMap: Record<string, string> = {}
        const clkMap: Record<string, { clock_in: string|null; clock_out: string|null }> = {}
        a.forEach((r: AttendanceRecord) => {
          statusMap[r.staff_id] = r.status
          clkMap[r.staff_id] = { clock_in: r.clock_in, clock_out: r.clock_out }
        })
        setAttendanceMap(statusMap)
        setClockMap(clkMap)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [selectedDate])

  const [reportMonth, setReportMonth] = useState(() => new Date().toISOString().substring(0, 7))
  const [reportData, setReportData] = useState<Record<string, { present: number, half: number, absent: number, leave: number }>>({})
  const [reportLoading, setReportLoading] = useState(false)

  useEffect(() => { void fetchData() }, [fetchData])

  useEffect(() => {
    if (tab !== 'report') return
    const fetchReport = async () => {
      setReportLoading(true)
      try {
        const startDate = `${reportMonth}-01`
        const dateObj = new Date(`${reportMonth}-01T00:00:00`)
        dateObj.setMonth(dateObj.getMonth() + 1); dateObj.setDate(0)
        const endDate = dateObj.toISOString().split('T')[0]
        const { data } = await supabase.from('attendance').select('*').gte('date', startDate).lte('date', endDate)
        if (data) {
          const stats: Record<string, { present: number, half: number, absent: number, leave: number }> = {}
          data.forEach((r: AttendanceRecord) => {
            if (!stats[r.staff_id]) stats[r.staff_id] = { present: 0, half: 0, absent: 0, leave: 0 }
            if (r.status === 'present') stats[r.staff_id].present++
            else if (r.status === 'half-day') stats[r.staff_id].half++
            else if (r.status === 'absent') stats[r.staff_id].absent++
            else if (r.status === 'leave') stats[r.staff_id].leave++
          })
          setReportData(stats)
        }
      } catch (e) { console.error(e) }
      finally { setReportLoading(false) }
    }
    void fetchReport()
  }, [tab, reportMonth])

  const markAttendance = async (staffId: string, status: string) => {
    setAttendanceMap(p => ({ ...p, [staffId]: status }))
    await supabase.from('attendance').upsert({ staff_id: staffId, date: selectedDate, status }, { onConflict: 'staff_id,date' })
  }

  const handleSaveStaff = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim() || !form.role.trim()) return
    setSubmitting(true)
    try {
      const payload = { name: form.name.trim(), role: form.role.trim(), phone: form.phone.trim() || null, base_salary: parseFloat(form.base_salary) || 0 }
      if (editingStaff) {
        await supabase.from('staff').update(payload).eq('id', editingStaff.id)
      } else {
        await supabase.from('staff').insert({ ...payload, is_active: true })
      }
      setShowModal(false); setEditingStaff(null); void fetchData()
    } catch (err) { console.error(err); alert('Failed to save staff member') }
    finally { setSubmitting(false) }
  }

  const toggleStaffActive = async (member: Staff) => {
    await supabase.from('staff').update({ is_active: !member.is_active }).eq('id', member.id)
    void fetchData()
  }


  const activeStaff = staff.filter(s => s.is_active)
  const presentCount = activeStaff.filter(s => attendanceMap[s.id] === 'present').length
  const absentCount = activeStaff.filter(s => attendanceMap[s.id] === 'absent').length
  const leaveCount = activeStaff.filter(s => ['half-day', 'leave'].includes(attendanceMap[s.id])).length

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
        <h1 className="text-2xl font-black text-[#111111] flex items-center gap-2"><Users size={24} className="text-[#E87020]" /> Attendance & Staff</h1>
      </div>

      {dbError && (
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 p-4 rounded-xl flex items-start gap-3">
          <AlertTriangle size={20} className="shrink-0 mt-0.5" />
          <div>
            <p className="font-black text-sm">Database tables not set up yet!</p>
            <p className="text-[13px]">Please run the SQL migration script in your Supabase SQL Editor.</p>
          </div>
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        {(['today', 'report', 'staff'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`shrink-0 px-4 py-2 rounded-xl font-bold text-sm transition-colors ${tab === t ? 'bg-[#E87020] text-white' : 'bg-white border border-[#FDDBB4]/60 text-[#374151] hover:bg-orange-50'}`}>
            {t === 'today' ? "Today's Attendance" : t === 'report' ? 'Monthly Report' : 'Staff Management'}
          </button>
        ))}
      </div>

      {/* TODAY TAB */}
      {tab === 'today' && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-[#FDDBB4]/60 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="bg-orange-100 p-2.5 rounded-xl text-orange-600"><Calendar size={20} /></div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-[#6B7280]">Select Date</p>
                <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="font-black text-[#111111] bg-transparent outline-none" />
              </div>
            </div>
            <div className="flex gap-4 sm:gap-6 flex-wrap">
              <div className="text-center"><p className="text-[10px] font-black uppercase text-[#6B7280]">Total</p><p className="text-xl font-black">{activeStaff.length}</p></div>
              <div className="text-center"><p className="text-[10px] font-black uppercase text-[#6B7280]">Present</p><p className="text-xl font-black text-green-600">{presentCount}</p></div>
              <div className="text-center"><p className="text-[10px] font-black uppercase text-[#6B7280]">Absent</p><p className="text-xl font-black text-red-600">{absentCount}</p></div>
              <div className="text-center"><p className="text-[10px] font-black uppercase text-[#6B7280]">Leave/Half</p><p className="text-xl font-black text-orange-600">{leaveCount}</p></div>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-[#FDDBB4]/60 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-[#FAFAFA] border-b border-[#FDDBB4]/60">
                  <tr>
                    <th className="px-4 py-3 text-[11px] font-black uppercase text-[#374151]">Staff Member</th>
                    <th className="px-4 py-3 text-[11px] font-black uppercase text-[#374151]">Role</th>
                    <th className="px-4 py-3 text-[11px] font-black uppercase text-green-700">Clock In</th>
                    <th className="px-4 py-3 text-[11px] font-black uppercase text-red-600">Clock Out</th>
                    <th className="px-4 py-3 text-[11px] font-black uppercase text-[#374151]">Override Status</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={5} className="text-center p-8 text-[#6B7280] font-bold">Loading...</td></tr>
                  ) : activeStaff.length === 0 ? (
                    <tr><td colSpan={5} className="text-center p-8 text-[#6B7280] font-bold">No active staff. Add staff in Staff Management tab.</td></tr>
                  ) : activeStaff.map(member => {
                    const clk = clockMap[member.id]
                    const status = attendanceMap[member.id]
                    return (
                      <tr key={member.id} className="border-b border-[#FDDBB4]/30 hover:bg-[#FAFAFA]">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-[#FFF8F2] text-[#E87020] border border-[#FDDBB4] flex items-center justify-center font-black text-sm shrink-0 uppercase">{member.name.charAt(0)}</div>
                            <span className="font-bold text-[#111111] text-sm">{member.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-[#374151]">{member.role}</td>
                        <td className="px-4 py-3">
                          {clk?.clock_in ? (
                            <span className="flex items-center gap-1 text-sm font-black text-green-700">
                              <LogIn size={13} />{formatTime(clk.clock_in)}
                            </span>
                          ) : <span className="text-[#9BAB9A] text-xs">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          {clk?.clock_out ? (
                            <span className="flex items-center gap-1 text-sm font-black text-red-600">
                              <LogOut size={13} />{formatTime(clk.clock_out)}
                            </span>
                          ) : <span className="text-[#9BAB9A] text-xs">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1.5 flex-wrap">
                            {['present', 'absent', 'half-day', 'leave'].map(s => {
                              const isSelected = status === s
                              let colorClass = 'bg-gray-50 text-[#6B7280] border-gray-200 hover:bg-gray-100'
                              if (isSelected) {
                                if (s === 'present') colorClass = 'bg-green-100 text-green-700 border-green-200 shadow-sm'
                                else if (s === 'absent') colorClass = 'bg-red-100 text-red-700 border-red-200 shadow-sm'
                                else colorClass = 'bg-orange-100 text-orange-700 border-orange-200 shadow-sm'
                              }
                              return (
                                <button key={s} onClick={() => void markAttendance(member.id, s)} disabled={dbError}
                                  className={`px-2.5 py-1.5 rounded-lg border text-[10px] font-black uppercase tracking-wider transition-all disabled:opacity-50 ${colorClass}`}>
                                  {s.replace('-', ' ')}
                                </button>
                              )
                            })}
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

      {/* STAFF TAB */}
      {tab === 'staff' && (
        <div className="space-y-5">
          <div className="flex justify-end">
            <button onClick={() => { setEditingStaff(null); setForm({ name: '', role: '', phone: '', base_salary: '' }); setShowModal(true) }} disabled={dbError}
              className="bg-[#E87020] text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-[#C85C10] disabled:opacity-50">
              <Plus size={16} /> Add Staff
            </button>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-[#FDDBB4]/60 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-[#FAFAFA] border-b border-[#FDDBB4]/60">
                  <tr>
                    <th className="px-4 py-3 text-[11px] font-black uppercase text-[#374151]">Name</th>
                    <th className="px-4 py-3 text-[11px] font-black uppercase text-[#374151]">Role</th>
                    <th className="px-4 py-3 text-[11px] font-black uppercase text-[#374151]">Phone</th>
                    <th className="px-4 py-3 text-[11px] font-black uppercase text-[#374151]">Base Salary</th>
                    <th className="px-4 py-3 text-[11px] font-black uppercase text-[#374151] text-center">Status</th>
                    <th className="px-4 py-3 text-[11px] font-black uppercase text-[#374151] text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {staff.length === 0 ? (
                    <tr><td colSpan={6} className="text-center p-8 text-[#6B7280] font-bold">No staff added yet.</td></tr>
                  ) : staff.map(member => (
                    <tr key={member.id} className="border-b border-[#FDDBB4]/30 hover:bg-[#FAFAFA]">
                      <td className="px-4 py-3 font-bold text-[#111111] text-sm">{member.name}</td>
                      <td className="px-4 py-3 text-sm text-[#374151]">{member.role}</td>
                      <td className="px-4 py-3 text-sm text-[#374151]">{member.phone || '—'}</td>
                      <td className="px-4 py-3 text-sm font-black text-[#111111]">{formatCurrency(member.base_salary)}</td>
                      <td className="px-4 py-3 text-center">
                        <button onClick={() => toggleStaffActive(member)}
                          className={`px-3 py-1 text-[10px] font-black uppercase tracking-wider rounded-lg border ${member.is_active ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-50 text-gray-500 border-gray-200'}`}>
                          {member.is_active ? 'Active' : 'Inactive'}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => { setEditingStaff(member); setForm({ name: member.name, role: member.role, phone: member.phone || '', base_salary: String(member.base_salary) }); setShowModal(true) }}
                          className="text-[#374151] hover:text-[#E87020] p-1.5 bg-gray-50 hover:bg-[#FFF8F2] rounded-lg border border-transparent hover:border-[#FDDBB4] transition-colors">
                          <Edit2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* MONTHLY REPORT TAB */}
      {tab === 'report' && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-[#FDDBB4]/60 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="bg-purple-100 p-2.5 rounded-xl text-purple-600"><Calendar size={20} /></div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-[#6B7280]">Select Month</p>
                <input type="month" value={reportMonth} onChange={e => setReportMonth(e.target.value)} className="font-black text-[#111111] bg-transparent outline-none" />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-[#FDDBB4]/60 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-[#FAFAFA] border-b border-[#FDDBB4]/60">
                  <tr>
                    <th className="px-4 py-3 text-[11px] font-black uppercase text-[#374151]">Staff Member</th>
                    <th className="px-4 py-3 text-[11px] font-black uppercase text-[#374151]">Role</th>
                    <th className="px-4 py-3 text-[11px] font-black uppercase text-green-600 text-center">Present</th>
                    <th className="px-4 py-3 text-[11px] font-black uppercase text-orange-500 text-center">Half Day</th>
                    <th className="px-4 py-3 text-[11px] font-black uppercase text-red-600 text-center">Absent</th>
                    <th className="px-4 py-3 text-[11px] font-black uppercase text-blue-600 text-center">Leave</th>
                  </tr>
                </thead>
                <tbody>
                  {reportLoading ? (
                    <tr><td colSpan={6} className="text-center p-8 text-[#6B7280] font-bold">Loading report...</td></tr>
                  ) : activeStaff.length === 0 ? (
                    <tr><td colSpan={6} className="text-center p-8 text-[#6B7280] font-bold">No active staff members.</td></tr>
                  ) : activeStaff.map(member => {
                    const stats = reportData[member.id] || { present: 0, half: 0, absent: 0, leave: 0 }
                    return (
                      <tr key={member.id} className="border-b border-[#FDDBB4]/30 hover:bg-[#FAFAFA]">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-[#FFF8F2] text-[#E87020] border border-[#FDDBB4] flex items-center justify-center font-black text-sm shrink-0 uppercase">{member.name.charAt(0)}</div>
                            <span className="font-bold text-[#111111] text-sm">{member.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-[#374151]">{member.role}</td>
                        <td className="px-4 py-3 text-center font-bold text-green-700">{stats.present}</td>
                        <td className="px-4 py-3 text-center font-bold text-orange-600">{stats.half}</td>
                        <td className="px-4 py-3 text-center font-bold text-red-700">{stats.absent}</td>
                        <td className="px-4 py-3 text-center font-bold text-blue-700">{stats.leave}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-xl font-black text-[#111111]">{editingStaff ? 'Edit Staff' : 'Add Staff'}</h2>
              <button onClick={() => setShowModal(false)} className="p-2 rounded-xl hover:bg-gray-100"><X size={18} /></button>
            </div>
            <form onSubmit={handleSaveStaff} className="space-y-4">
              <div>
                <label className="block text-[10px] font-black uppercase text-[#374151] mb-1.5">Full Name *</label>
                <input type="text" value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="w-full border border-[#FDDBB4]/60 p-2.5 rounded-xl text-sm font-bold outline-none focus:border-[#E87020]" required />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase text-[#374151] mb-1.5">Role / Job Title *</label>
                <input type="text" value={form.role} onChange={e => setForm({...form, role: e.target.value})} placeholder="e.g. Tailor, Manager" className="w-full border border-[#FDDBB4]/60 p-2.5 rounded-xl text-sm font-bold outline-none focus:border-[#E87020]" required />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase text-[#374151] mb-1.5">Phone Number</label>
                <input type="tel" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} placeholder="+60" className="w-full border border-[#FDDBB4]/60 p-2.5 rounded-xl text-sm font-bold outline-none focus:border-[#E87020]" />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase text-[#374151] mb-1.5">Base Salary (RM)</label>
                <input type="number" step="0.01" min="0" value={form.base_salary} onChange={e => setForm({...form, base_salary: e.target.value})} className="w-full border border-[#FDDBB4]/60 p-2.5 rounded-xl text-sm font-bold outline-none focus:border-[#E87020]" placeholder="0.00" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 bg-gray-100 p-3 rounded-xl font-bold text-sm hover:bg-gray-200">Cancel</button>
                <button type="submit" disabled={submitting} className="flex-1 bg-[#E87020] text-white p-3 rounded-xl font-bold text-sm hover:bg-[#C85C10] disabled:opacity-50">{submitting ? 'Saving...' : 'Save Staff'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
