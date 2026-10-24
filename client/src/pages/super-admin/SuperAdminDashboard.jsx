import { useState, useEffect, useMemo, useRef } from "react"
import { Card, CardHeader, CardTitle, CardContent } from "../../components/ui/Card"
import { Badge } from "../../components/ui/Badge"
import { Button } from "../../components/ui/Button"
import { Input } from "../../components/ui/Input"
import { getSuperAdminDashboard, getComplex, createComplex, createAdmin, updateComplex, transitionComplexLifecycle, removeComplexAdmin } from "../../api/superAdmin"
import { Building2, Users, Plus, Loader2, Shield, MapPin, Pencil, Search, RotateCcw, Archive, Pause, Play } from "lucide-react"
import { Modal } from "../../components/ui/Modal"
import { archiveNameMatches, applyConfirmedAdminRemoval, filterSocieties } from "./societyState.mjs"
import toast from "react-hot-toast"

const asArray = (value) => Array.isArray(value) ? value : []
const emptyDashboard = { total_complexes: 0, total_users: 0, complexes: [] }
const normalizeDashboard = (data) => ({
  ...emptyDashboard,
  ...(data || {}),
  complexes: asArray(data?.complexes),
})

export default function SuperAdminDashboard() {
  const [data, setData] = useState(emptyDashboard)
  const [isLoading, setIsLoading] = useState(true)

  // Create Complex form
  const [showComplexForm, setShowComplexForm] = useState(false)
  const [complexForm, setComplexForm] = useState({ name: "", address: "" })
  const [complexLoading, setComplexLoading] = useState(false)

  // Create Admin form
  const [showAdminForm, setShowAdminForm] = useState(false)
  const [adminForm, setAdminForm] = useState({ email: "", phone: "", password: "", full_name: "", complex_id: "" })
  const [adminLoading, setAdminLoading] = useState(false)
  const [search, setSearch] = useState("")
  const [lifecycleFilter, setLifecycleFilter] = useState("all")
  const [subscriptionFilter, setSubscriptionFilter] = useState("all")
  const [editingSociety, setEditingSociety] = useState(null)
  const [editForm, setEditForm] = useState({ name: "", address: "" })
  const [editingAdmins, setEditingAdmins] = useState([])
  const [loadingAdmins, setLoadingAdmins] = useState(false)
  const [savingSociety, setSavingSociety] = useState(false)
  const [adminRemovalTarget, setAdminRemovalTarget] = useState(null)
  const [removingAdminId, setRemovingAdminId] = useState(null)
  const [lifecycleBusyId, setLifecycleBusyId] = useState(null)
  const [archiveTarget, setArchiveTarget] = useState(null)
  const [archiveConfirmation, setArchiveConfirmation] = useState("")
  const editDetailsRequest = useRef(0)
  const adminRemovalLock = useRef(false)

  const fetchData = async (showSpinner = true) => {
    try {
      if (showSpinner) setIsLoading(true)
      const res = await getSuperAdminDashboard()
      setData(res.success ? normalizeDashboard(res.data) : emptyDashboard)
      return res.success ? normalizeDashboard(res.data) : emptyDashboard
    } catch {
      toast.error("Failed to load dashboard")
      return null
    } finally {
      if (showSpinner) setIsLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [])

  const handleCreateComplex = async (e) => {
    e.preventDefault()
    setComplexLoading(true)
    try {
      const res = await createComplex(complexForm)
      if (res.success) {
        toast.success("Society created successfully!")
        setComplexForm({ name: "", address: "" })
        setShowComplexForm(false)
        fetchData()
      }
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to create society")
    } finally {
      setComplexLoading(false)
    }
  }

  const handleCreateAdmin = async (e) => {
    e.preventDefault()
    setAdminLoading(true)
    try {
      const res = await createAdmin(adminForm)
      if (res.success) {
        toast.success("Admin created successfully!")
        setAdminForm({ email: "", phone: "", password: "", full_name: "", complex_id: "" })
        setShowAdminForm(false)
        fetchData()
      }
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to create admin")
    } finally {
      setAdminLoading(false)
    }
  }

  const visibleSocieties = useMemo(() => {
    return filterSocieties(data.complexes, { search, lifecycleStatus: lifecycleFilter, subscriptionStatus: subscriptionFilter })
  }, [data.complexes, lifecycleFilter, search, subscriptionFilter])

  const beginEdit = async (complex) => {
    const requestId = ++editDetailsRequest.current
    setEditingSociety(complex.id)
    setEditForm({ name: complex.name, address: complex.address || "" })
    setEditingAdmins(asArray(complex.admins))
    setLoadingAdmins(true)
    try {
      const response = await getComplex(complex.id)
      if (requestId !== editDetailsRequest.current) return
      if (!response?.success) throw new Error(response?.message || "Could not load society administrators")
      setEditingAdmins(asArray(response.data?.admins))
    } catch (error) {
      if (requestId === editDetailsRequest.current) {
        toast.error(error.response?.data?.message || error.message || "Could not load society administrators")
      }
    } finally {
      if (requestId === editDetailsRequest.current) setLoadingAdmins(false)
    }
  }

  const closeEdit = () => {
    editDetailsRequest.current += 1
    setEditingSociety(null)
    setLoadingAdmins(false)
  }

  const saveSociety = async (event) => {
    event.preventDefault()
    if (!editingSociety || savingSociety) return
    setSavingSociety(true)
    try {
      await updateComplex(editingSociety, editForm)
      toast.success("Society details updated")
      closeEdit()
      await fetchData(false)
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not update society")
    } finally { setSavingSociety(false) }
  }

  const confirmAdminRemoval = async () => {
    const target = adminRemovalTarget
    if (!target || adminRemovalLock.current) return
    adminRemovalLock.current = true
    setRemovingAdminId(target.admin.id)
    try {
      const response = await removeComplexAdmin(target.complex.id, target.admin.id)
      if (!response?.success) throw new Error(response?.message || "Could not remove administrator")
      setEditingAdmins((admins) => applyConfirmedAdminRemoval(admins, response, target.admin.id))
      setAdminRemovalTarget(null)
      toast.success("Administrator removed from society")
      await fetchData(false)
    } catch (error) {
      toast.error(error.response?.data?.message || error.message || "Could not remove administrator")
    } finally {
      adminRemovalLock.current = false
      setRemovingAdminId(null)
    }
  }

  const runLifecycleAction = async (complex, action, confirmName) => {
    if (lifecycleBusyId) return
    if (action !== "archive" && !window.confirm(`${action === "suspend" ? "Suspend" : action === "reactivate" ? "Reactivate" : "Restore"} ${complex.name}?`)) return
    setLifecycleBusyId(complex.id)
    try {
      await transitionComplexLifecycle(complex.id, { action, ...(confirmName ? { confirm_name: confirmName } : {}) })
      const outcome = { suspend: "suspended", reactivate: "reactivated", archive: "archived", restore: "restored" }[action]
      toast.success(`Society ${outcome}`)
      setArchiveTarget(null)
      setArchiveConfirmation("")
      await fetchData(false)
    } catch (error) {
      toast.error(error.response?.data?.message || `Could not ${action} society`)
    } finally { setLifecycleBusyId(null) }
  }

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-20 text-gray-500 space-y-4 flex-col">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
        <p>Loading super admin dashboard…</p>
      </div>
    )
  }

  const statCards = [
    {
      title: "Total Societies",
      value: data.total_complexes,
      icon: Building2,
      color: "text-indigo-500",
      bg: "bg-indigo-100 dark:bg-indigo-900/30",
      border: "border-indigo-200 dark:border-indigo-800",
    },
    {
      title: "Total Users",
      value: data.total_users,
      icon: Users,
      color: "text-emerald-500",
      bg: "bg-emerald-100 dark:bg-emerald-900/30",
      border: "border-emerald-200 dark:border-emerald-800",
    },
  ]

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Super Admin Dashboard</h2>
          <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">Platform-wide overview of all societies.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => { setShowComplexForm(!showComplexForm); setShowAdminForm(false) }}
            className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            <Plus className="w-4 h-4" /> New Society
          </Button>
          <Button
            onClick={() => { setShowAdminForm(!showAdminForm); setShowComplexForm(false) }}
            className="gap-2"
            variant="outline"
          >
            <Shield className="w-4 h-4" /> New Admin
          </Button>
        </div>
      </div>

      {/* Create Complex Form */}
      {showComplexForm && (
        <Card className="animate-in fade-in slide-in-from-top-2 border-indigo-200 dark:border-indigo-800">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">Create New Society</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateComplex} className="flex flex-col sm:flex-row gap-3">
              <Input
                required
                placeholder="Society name"
                value={complexForm.name}
                onChange={(e) => setComplexForm({ ...complexForm, name: e.target.value })}
                className="flex-1"
              />
              <Input
                placeholder="Address (optional)"
                value={complexForm.address}
                onChange={(e) => setComplexForm({ ...complexForm, address: e.target.value })}
                className="flex-1"
              />
              <Button type="submit" disabled={complexLoading} className="bg-indigo-600 hover:bg-indigo-700 text-white whitespace-nowrap">
                {complexLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Create Admin Form */}
      {showAdminForm && (
        <Card className="animate-in fade-in slide-in-from-top-2 border-violet-200 dark:border-violet-800">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">Create New Admin</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateAdmin} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <Input required minLength={2} maxLength={255} autoComplete="name" placeholder="Full name" value={adminForm.full_name} onChange={(e) => setAdminForm({ ...adminForm, full_name: e.target.value })} />
              <Input required type="email" autoComplete="email" placeholder="Email" value={adminForm.email} onChange={(e) => setAdminForm({ ...adminForm, email: e.target.value })} />
              <Input required type="tel" pattern="[6-9][0-9]{9}" maxLength={10} autoComplete="tel" placeholder="10-digit Indian phone" value={adminForm.phone} onChange={(e) => setAdminForm({ ...adminForm, phone: e.target.value.replace(/\D/g, '') })} />
              <Input required minLength={12} maxLength={128} autoComplete="new-password" type="password" placeholder="Password (12+ characters)" value={adminForm.password} onChange={(e) => setAdminForm({ ...adminForm, password: e.target.value })} />
              <select
                required
                value={adminForm.complex_id}
                onChange={(e) => setAdminForm({ ...adminForm, complex_id: e.target.value })}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="" disabled>Select society</option>
                {data.complexes.filter((c) => (c.lifecycle_status || "active") === "active").map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <Button type="submit" disabled={adminLoading} className="whitespace-nowrap">
                {adminLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create Admin"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {statCards.map((stat, i) => (
          <Card key={i} className="animate-in fade-in slide-in-from-bottom-4 border-none shadow-md overflow-hidden relative group" style={{ animationDelay: `${i * 80}ms` }}>
            <div className={`absolute top-0 right-0 w-24 h-24 -mr-8 -mt-8 rounded-full opacity-20 ${stat.bg} group-hover:scale-150 transition-transform duration-500`} />
            <CardContent className="p-6 flex items-center justify-between relative z-10">
              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{stat.title}</p>
                <h3 className="text-3xl font-bold mt-2 text-foreground">{stat.value}</h3>
              </div>
              <div className={`p-3.5 rounded-2xl ${stat.bg} ${stat.color} shadow-sm border ${stat.border}`}>
                <stat.icon className="w-6 h-6" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Societies List */}
      <Card className="animate-in fade-in slide-in-from-bottom-6 delay-200">
        <CardHeader className="pb-4 border-b border-border/40">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <Building2 className="w-5 h-5 text-indigo-500" />
            All Societies
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_auto_auto]">
            <label className="relative block"><span className="sr-only">Search societies</span><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search societies, addresses, or admins" className="pl-9" /></label>
            <select aria-label="Filter societies by lifecycle status" value={lifecycleFilter} onChange={(event) => setLifecycleFilter(event.target.value)} className="h-9 rounded-md border border-input bg-card px-3 text-sm"><option value="all">All lifecycle states</option><option value="active">Active</option><option value="suspended">Suspended</option><option value="archived">Archived</option></select>
            <select aria-label="Filter societies by subscription status" value={subscriptionFilter} onChange={(event) => setSubscriptionFilter(event.target.value)} className="h-9 rounded-md border border-input bg-card px-3 text-sm"><option value="all">All subscription states</option><option value="active">Active subscription</option><option value="trial">Trial</option><option value="cancelled">Cancelled</option><option value="expired">Expired</option><option value="none">No subscription record</option></select>
          </div>
          {visibleSocieties.length === 0 ? (
            <div className="py-8 text-center text-gray-500 text-sm">
              {data.complexes.length ? "No societies match these filters." : "No societies created yet."}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {visibleSocieties.map((complex) => (
                <div
                  key={complex.id}
                  className="p-5 rounded-xl border border-border bg-card hover:shadow-md transition-shadow duration-200"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                        <Building2 className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="font-semibold text-foreground">{complex.name}</h4>
                        {complex.address && (
                          <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                            <MapPin className="w-3 h-3" /> {complex.address}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="mb-3 flex flex-wrap gap-2">
                    <Badge variant={complex.lifecycle_status === "archived" ? "destructive" : complex.lifecycle_status === "suspended" ? "secondary" : "success"}>{complex.lifecycle_status || "active"}</Badge>
                    {complex.subscription_status && <Badge variant="outline">Subscription: {complex.subscription_status}</Badge>}
                  </div>
                  {editingSociety === complex.id && <form onSubmit={saveSociety} className="mb-3 space-y-3 rounded-lg border border-border p-3">
                    <h5 className="font-medium text-foreground">Edit Society</h5>
                    <Input aria-label="Society name" required minLength={2} maxLength={255} value={editForm.name} onChange={(event) => setEditForm({ ...editForm, name: event.target.value })} />
                    <Input aria-label="Society address" maxLength={500} value={editForm.address} onChange={(event) => setEditForm({ ...editForm, address: event.target.value })} placeholder="Address" />
                    <div className="flex gap-2"><Button type="submit" size="sm" disabled={savingSociety || editForm.name.trim().length < 2}>{savingSociety ? "Saving…" : "Save details"}</Button><Button type="button" variant="outline" size="sm" onClick={closeEdit} disabled={savingSociety || Boolean(removingAdminId)}>Close</Button></div>
                    <section className="border-t border-border/60 pt-3" aria-labelledby={`society-admins-${complex.id}`} aria-busy={loadingAdmins || Boolean(removingAdminId)}>
                      <h6 id={`society-admins-${complex.id}`} className="mb-2 text-sm font-semibold">Administrators</h6>
                      {loadingAdmins ? <p className="text-sm text-gray-500">Loading administrators…</p> : editingAdmins.length ? (
                        <ul className="space-y-2">
                          {editingAdmins.map((admin) => (
                            <li key={admin.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-secondary/40 px-2.5 py-2 text-sm">
                              <span className="min-w-0"><span className="font-medium">{admin.full_name}</span><span className="ml-1 break-all text-gray-500">({admin.email})</span>{admin.is_active === false && <Badge variant="secondary" className="ml-2">Inactive</Badge>}</span>
                              <Button type="button" variant="destructive" size="sm" disabled={Boolean(removingAdminId)} onClick={() => setAdminRemovalTarget({ complex, admin })}>
                                {removingAdminId === admin.id ? <Loader2 className="h-4 w-4 animate-spin" aria-label="Removing administrator" /> : "Remove Admin"}
                              </Button>
                            </li>
                          ))}
                        </ul>
                      ) : <p className="text-sm text-gray-500">No administrators assigned. Use New Admin to add one.</p>}
                    </section>
                  </form>}
                  <div className="pt-3 border-t border-border/40 text-sm">
                    <div className="text-gray-500 mb-1 font-medium">Admin(s):</div>
                    {complex.admins && complex.admins.length > 0 ? (
                      <ul className="space-y-1">
                        {complex.admins.map((admin, idx) => (
                          <li key={idx} className="text-gray-700 dark:text-gray-300">
                            • {admin.full_name} <span className="text-gray-400">({admin.email})</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="text-gray-400 italic">No Admin Assigned</div>
                    )}
                  </div>
                  <div className="flex items-center justify-between pt-3 mt-3 border-t border-border/40">
                    <div className="flex items-center gap-1.5 text-sm text-gray-500">
                      <Users className="w-4 h-4" />
                      <span>{complex.total_users} users</span>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {new Date(complex.created_at).toLocaleDateString()}
                    </Badge>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 border-t border-border/40 pt-3">
                    <Button variant="outline" size="sm" onClick={() => beginEdit(complex)}><Pencil className="mr-1.5 h-3.5 w-3.5" />Edit</Button>
                    {(complex.lifecycle_status || "active") === "active" && <Button variant="outline" size="sm" disabled={Boolean(lifecycleBusyId)} onClick={() => runLifecycleAction(complex, "suspend")}><Pause className="mr-1.5 h-3.5 w-3.5" />Suspend</Button>}
                    {complex.lifecycle_status === "suspended" && <Button variant="outline" size="sm" disabled={Boolean(lifecycleBusyId)} onClick={() => runLifecycleAction(complex, "reactivate")}><Play className="mr-1.5 h-3.5 w-3.5" />Reactivate</Button>}
                    {complex.lifecycle_status === "archived" ? <Button variant="outline" size="sm" disabled={Boolean(lifecycleBusyId)} onClick={() => runLifecycleAction(complex, "restore")}><RotateCcw className="mr-1.5 h-3.5 w-3.5" />Restore</Button> : <Button variant="destructive" size="sm" disabled={Boolean(lifecycleBusyId)} onClick={() => { setArchiveTarget(complex); setArchiveConfirmation("") }}><Archive className="mr-1.5 h-3.5 w-3.5" />Archive</Button>}
                    {lifecycleBusyId === complex.id && <span className="self-center text-xs text-gray-500">Updating…</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      <Modal isOpen={Boolean(archiveTarget)} onClose={() => { if (!lifecycleBusyId) { setArchiveTarget(null); setArchiveConfirmation("") } }} title="Archive society">
        {archiveTarget && <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-300">Archiving <strong>{archiveTarget.name}</strong> removes it from normal society operations but preserves all records and relationships. This does not permanently delete data.</p>
          <label className="block space-y-1 text-sm font-medium">Type <strong>{archiveTarget.name}</strong> to confirm<Input autoComplete="off" value={archiveConfirmation} onChange={(event) => setArchiveConfirmation(event.target.value)} /></label>
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => { setArchiveTarget(null); setArchiveConfirmation("") }} disabled={Boolean(lifecycleBusyId)}>Cancel</Button><Button variant="destructive" disabled={!archiveNameMatches(archiveConfirmation, archiveTarget.name) || Boolean(lifecycleBusyId)} onClick={() => runLifecycleAction(archiveTarget, "archive", archiveConfirmation)}>{lifecycleBusyId === archiveTarget?.id ? "Archiving…" : "Archive society"}</Button></div>
        </div>}
      </Modal>
      <Modal isOpen={Boolean(adminRemovalTarget)} onClose={() => { if (!removingAdminId) setAdminRemovalTarget(null) }} title="Remove administrator">
        {adminRemovalTarget && <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-300">Remove <strong>{adminRemovalTarget.admin.full_name}</strong> ({adminRemovalTarget.admin.email}) from <strong>{adminRemovalTarget.complex.name}</strong>?</p>
          <p className="text-sm text-gray-600 dark:text-gray-300">This clears only the administrator’s association with this society. Their user account and admin role remain intact.</p>
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setAdminRemovalTarget(null)} disabled={Boolean(removingAdminId)}>Cancel</Button><Button type="button" variant="destructive" onClick={confirmAdminRemoval} disabled={Boolean(removingAdminId)}>{removingAdminId ? "Removing…" : "Remove Admin"}</Button></div>
        </div>}
      </Modal>
    </div>
  )
}
