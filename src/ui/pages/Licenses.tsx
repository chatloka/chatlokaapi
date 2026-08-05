import { useEffect, useState } from "react"
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
import { MoreHorizontal, Plus, Search } from "lucide-react"

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
}

interface LicensesResponse {
  licenses: License[]
}

export function Licenses() {
  const [licenses, setLicenses] = useState<License[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [selectedLicense, setSelectedLicense] = useState<License | null>(null)
  const [newDomain, setNewDomain] = useState("")

  useEffect(() => {
    fetchLicenses()
  }, [])

  async function fetchLicenses() {
    try {
      const res = await fetch("/manage/api/licenses", {
        credentials: "include",
      })
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

  async function handleStatusChange(licenseId: number, status: string) {
    try {
      const res = await fetch(`/manage/api/licenses/${licenseId}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status }),
      })
      if (res.ok) {
        fetchLicenses()
      }
    } catch (error) {
      console.error("Failed to update status:", error)
    }
  }

  async function handleDomainChange() {
    if (!selectedLicense || !newDomain) return

    try {
      const res = await fetch(
        `/manage/api/licenses/${selectedLicense.id}/domain`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ domain: newDomain }),
        }
      )
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

  const filteredLicenses = licenses.filter(
    (l) =>
      l.purchase_code.toLowerCase().includes(search.toLowerCase()) ||
      l.domain.toLowerCase().includes(search.toLowerCase()) ||
      l.buyer_email?.toLowerCase().includes(search.toLowerCase())
  )

  function getStatusBadge(status: string) {
    switch (status) {
      case "active":
        return <Badge className="bg-green-500">Active</Badge>
      case "deactivated":
        return <Badge variant="secondary">Deactivated</Badge>
      case "suspended":
        return <Badge variant="destructive">Suspended</Badge>
      default:
        return <Badge>{status}</Badge>
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Licenses</h1>
          <p className="text-muted-foreground">Manage license activations</p>
        </div>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Add License
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Licenses</CardTitle>
          <CardDescription>
            {licenses.length} total licenses in the system
          </CardDescription>
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by purchase code, domain, or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-sm"
            />
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Purchase Code</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Domain</TableHead>
                  <TableHead>Buyer</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Validated</TableHead>
                  <TableHead className="w-[70px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLicenses.map((license) => (
                  <TableRow key={license.id}>
                    <TableCell className="font-mono text-sm">
                      {license.purchase_code}
                    </TableCell>
                    <TableCell className="capitalize">
                      {license.license_type}
                    </TableCell>
                    <TableCell>{license.domain}</TableCell>
                    <TableCell>{license.buyer_email || "-"}</TableCell>
                    <TableCell>{getStatusBadge(license.status)}</TableCell>
                    <TableCell>
                      {license.last_validated_at
                        ? new Date(license.last_validated_at).toLocaleDateString()
                        : "-"}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => {
                              setSelectedLicense(license)
                              setNewDomain(license.domain)
                              setEditDialogOpen(true)
                            }}
                          >
                            Change Domain
                          </DropdownMenuItem>
                          {license.status === "active" ? (
                            <>
                              <DropdownMenuItem
                                onClick={() =>
                                  handleStatusChange(license.id, "deactivated")
                                }
                              >
                                Deactivate
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() =>
                                  handleStatusChange(license.id, "suspended")
                                }
                                className="text-destructive"
                              >
                                Suspend
                              </DropdownMenuItem>
                            </>
                          ) : (
                            <DropdownMenuItem
                              onClick={() =>
                                handleStatusChange(license.id, "active")
                              }
                            >
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
          )}
        </CardContent>
      </Card>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Domain</DialogTitle>
            <DialogDescription>
              Update the domain for purchase code{" "}
              <span className="font-mono">{selectedLicense?.purchase_code}</span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="domain">New Domain</Label>
              <Input
                id="domain"
                placeholder="example.com"
                value={newDomain}
                onChange={(e) => setNewDomain(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleDomainChange}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
