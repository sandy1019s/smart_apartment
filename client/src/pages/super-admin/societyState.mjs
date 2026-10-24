export const filterSocieties = (societies, { search = "", lifecycleStatus = "all", subscriptionStatus = "all" } = {}) => {
  const term = search.trim().toLowerCase()
  return (Array.isArray(societies) ? societies : []).filter((society) => {
    if (lifecycleStatus !== "all" && (society.lifecycle_status || "active") !== lifecycleStatus) return false
    if (subscriptionStatus === "none" && society.subscription_status) return false
    if (subscriptionStatus !== "all" && subscriptionStatus !== "none" && society.subscription_status !== subscriptionStatus) return false
    if (!term) return true
    const searchable = [society.name, society.address, ...(society.admins || []).flatMap((admin) => [admin.full_name, admin.email])]
    return searchable.some((value) => String(value || "").toLowerCase().includes(term))
  })
}

export const archiveNameMatches = (typedName, societyName) => typedName === societyName
