import { useEffect, useMemo, useState } from "react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  IconDotsVertical,
  IconPlus,
  IconSearch,
  IconEditCircle,
  IconBan,
  IconPlayerStop,
  IconPlayerPlay,
  IconKey,
  IconWorld,
  IconMail,
  IconUser,
  IconClock,
} from "@tabler/icons-react"
import { toast } from "sonner"

interface License {
  id: number
  purchase_code: string
  license_type: string
  domain: string
  buyer_email: string
  buyer_name: string
  status: string
  activated_at: string
  last_validated_at: string
  created_at: string
  updated_at: string
}

interface LicensesResponse {
  licenses: License[]
}

function toWIB(dateStr: string | null) {
  if (!dateStr) return "-"
  const d = new Date(dateStr)
  return d.toLocaleString("en-GB", { timeZone: "Asia/Jakarta", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })
}

export function Licenses() {
  const [licenses, setLicenses] = useState<License[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [sort, setSort] = useState("newest")
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [selectedLicense, setSelectedLicense] = useState<License | null>(null)
  const [newDomain, setNewDomain] = useState("")

  const [createPurchaseCode, setCreatePurchaseCode] = useState("")
  const [createLicenseType, setCreateLicenseType] = useState("regular")
  const [createDomain, setCreateDomain] = useState("")
  const [createBuyerEmail, setCreateBuyerEmail] = useState("")
  const [createBuyerName, setCreateBuyerName] = useState("")

  useEffect(() => {
    fetchLicenses()
  }, [])

  async function fetchLicenses() {
    try {
      const res = await fetch("/manage/api/licenses", { credentials: "include" })
      if (res.ok) {
        const data: LicensesResponse = await res.json()
        setLicenses(data.licenses || [])
      }
    } catch (error) {
      console.error("Failed to fetch licenses:", error)
    } finally {
      setLoading(false)
    }
  }

  async function handleCreateLicense() {
    if (!createPurchaseCode || !createDomain) return
    try {
      const res = await fetch("/manage/api/licenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          purchase_code: createPurchaseCode,
          license_type: createLicenseType,
          domain: createDomain,
          buyer_email: createBuyerEmail || undefined,
          buyer_name: createBuyerName || undefined,
        }),
      })
      if (res.ok) {
        setCreateDialogOpen(false)
        setCreatePurchaseCode("")
        setCreateLicenseType("regular")
        setCreateDomain("")
        setCreateBuyerEmail("")
        setCreateBuyerName("")
        toast.success("License created")
        fetchLicenses()
      } else {
        const errorData = await res.json().catch(() => ({})) as { message?: string }
        toast.error(errorData.message || "Failed to create license")
      }
    } catch (error) {
      toast.error("Failed to create license")
      console.error("Failed to create license:", error)
    }
  }

  async function handleStatusChange(licenseId: number, status: string) {
    try {
      const res = await fetch(`/manage/api/licenses/${licenseId}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status }),
      })
      if (res.ok) fetchLicenses()
    } catch (error) {
      console.error("Failed to update status:", error)
    }
  }

  async function handleDomainChange() {
    if (!selectedLicense || !newDomain) return
    try {
      const res = await fetch(`/manage/api/licenses/${selectedLicense.id}/domain`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ domain: newDomain }),
      })
      if (res.ok) {
        setEditDialogOpen(false)
        setSelectedLicense(null)
        setNewDomain("")
        fetchLicenses()
      }
    } catch (error) {
      console.error("Failed to update domain:", error)
    }
  }

  const filteredLicenses = useMemo(() => {
    const searched = licenses.filter(
      (l) =>
        l.purchase_code.toLowerCase().includes(search.toLowerCase()) ||
        l.domain.toLowerCase().includes(search.toLowerCase()) ||
        l.buyer_email?.toLowerCase().includes(search.toLowerCase())
    )
    switch (sort) {
      case "newest":
        return [...searched].sort((a, b) => new Date(b.created_at ?? b.activated_at ?? 0).getTime() - new Date(a.created_at ?? a.activated_at ?? 0).getTime())
      case "oldest":
        return [...searched].sort((a, b) => new Date(a.created_at ?? a.activated_at ?? 0).getTime() - new Date(b.created_at ?? b.activated_at ?? 0).getTime())
      case "status":
        return [...searched].sort((a, b) => a.status.localeCompare(b.status))
      case "domain":
        return [...searched].sort((a, b) => a.domain.localeCompare(b.domain))
      default:
        return searched
    }
  }, [licenses, search, sort])

  function getStatusBadge(status: string) {
    switch (status) {
      case "active":
        return <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/20">Active</Badge>
      case "deactivated":
        return <Badge variant="secondary">Deactivated</Badge>
      case "suspended":
        return <Badge variant="destructive">Suspended</Badge>
      default:
        return <Badge>{status}</Badge>
    }
  }

  function getTypeBadge(type: string) {
    switch (type) {
      case "regular":
        return <Badge className="bg-blue-500/15 text-blue-500 border-blue-500/20">Regular</Badge>
      case "extended":
        return <Badge className="bg-purple-500/15 text-purple-500 border-purple-500/20">Extended</Badge>
      case "lifetime":
        return <Badge className="bg-amber-500/15 text-amber-500 border-amber-500/20">Lifetime</Badge>
      default:
        return <Badge>{type}</Badge>
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Licenses</h1>
          <p className="text-muted-foreground">Manage license activations</p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)} className="cursor-pointer">
          <IconPlus className="mr-2 h-4 w-4" />
          Add License
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Licenses</CardTitle>
          <CardDescription>{licenses.length} total licenses in the system</CardDescription>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <IconSearch className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by purchase code, domain, or email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="max-w-sm pl-8"
              />
            </div>
            <Select value={sort} onValueChange={setSort}>
              <SelectTrigger className="w-[160px] cursor-pointer">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest first</SelectItem>
                <SelectItem value="oldest">Oldest first</SelectItem>
                <SelectItem value="status">Status</SelectItem>
                <SelectItem value="domain">Domain A-Z</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      <div className="flex items-center gap-1"><IconKey className="h-3 w-3" /> Purchase Code</div>
                    </TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>
                      <div className="flex items-center gap-1"><IconWorld className="h-3 w-3" /> Domain</div>
                    </TableHead>
                    <TableHead>
                      <div className="flex items-center gap-1"><IconMail className="h-3 w-3" /> Buyer</div>
                    </TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>
                      <div className="flex items-center gap-1"><IconClock className="h-3 w-3" /> Last Validated</div>
                    </TableHead>
                    <TableHead className="w-[70px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLicenses.map((license) => (
                    <TableRow key={license.id}>
                      <TableCell className="font-mono text-sm">{license.purchase_code}</TableCell>
                      <TableCell>{getTypeBadge(license.license_type)}</TableCell>
                      <TableCell>{license.domain}</TableCell>
                      <TableCell>{license.buyer_email || "-"}</TableCell>
                      <TableCell>{getStatusBadge(license.status)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{toWIB(license.last_validated_at)}</TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger className="cursor-pointer">
                            <Button variant="ghost" size="icon" className="cursor-pointer">
                              <IconDotsVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => { setSelectedLicense(license); setNewDomain(license.domain); setEditDialogOpen(true) }}
                              className="cursor-pointer"
                            >
                              <IconEditCircle className="mr-2 h-4 w-4" />
                              Change Domain
                            </DropdownMenuItem>
                            {license.status === "active" ? (
                              <>
                                <DropdownMenuItem onClick={() => handleStatusChange(license.id, "deactivated")} className="cursor-pointer">
                                  <IconBan className="mr-2 h-4 w-4" />
                                  Deactivate
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleStatusChange(license.id, "suspended")} className="cursor-pointer text-destructive hover:text-destructive focus:text-destructive">
                                  <IconPlayerStop className="mr-2 h-4 w-4" />
                                  Suspend
                                </DropdownMenuItem>
                              </>
                            ) : (
                              <DropdownMenuItem onClick={() => handleStatusChange(license.id, "active")} className="cursor-pointer">
                                <IconPlayerPlay className="mr-2 h-4 w-4" />
                                Enable
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Domain Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Domain</DialogTitle>
            <DialogDescription>Update the domain for purchase code <span className="font-mono">{selectedLicense?.purchase_code}</span></DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="domain">New Domain</Label>
              <Input id="domain" placeholder="example.com" value={newDomain} onChange={(e) => setNewDomain(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)} className="cursor-pointer">Cancel</Button>
            <Button onClick={handleDomainChange} className="cursor-pointer">Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create License Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create License</DialogTitle>
            <DialogDescription>Add a new license to the system.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="purchase-code">Purchase Code *</Label>
              <Input id="purchase-code" placeholder="Enter purchase code" value={createPurchaseCode} onChange={(e) => setCreatePurchaseCode(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>License Type</Label>
              <Select value={createLicenseType} onValueChange={setCreateLicenseType}>
                <SelectTrigger className="w-full cursor-pointer">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="regular">Regular</SelectItem>
                  <SelectItem value="extended">Extended</SelectItem>
                  <SelectItem value="lifetime">Lifetime</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-domain">Domain *</Label>
              <Input id="create-domain" placeholder="example.com" value={createDomain} onChange={(e) => setCreateDomain(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="buyer-email">Buyer Email</Label>
              <Input id="buyer-email" type="email" placeholder="buyer@example.com" value={createBuyerEmail} onChange={(e) => setCreateBuyerEmail(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="buyer-name">Buyer Name</Label>
              <Input id="buyer-name" placeholder="John Doe" value={createBuyerName} onChange={(e) => setCreateBuyerName(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)} className="cursor-pointer">Cancel</Button>
            <Button onClick={handleCreateLicense} disabled={!createPurchaseCode || !createDomain} className="cursor-pointer">Create License</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
