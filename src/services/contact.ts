import { all, first, run } from './d1'

export type ContactType = 'lead' | 'customer'
export type SupportStatus = 'active' | 'expired' | 'none'

export interface Contact {
  id: number
  email: string
  name: string | null
  type: ContactType
  first_contact_at: string | null
  last_contact_at: string | null
  total_tickets: number
  notes: string | null
  created_at: string
  updated_at: string
}

export interface ContactPurchase {
  id: number
  contact_id: number
  purchase_code: string
  license_type: 'regular' | 'extended'
  item_name: string | null
  purchase_date: string | null
  support_until: string | null
  support_term_months: number | null
  source: 'envato' | 'manual'
  created_at: string
  updated_at: string
}

/** A contact joined with its most relevant purchase info for badge display. */
export interface ContactWithLatestPurchase extends Contact {
  latest_purchase_code: string | null
  latest_license_type: 'regular' | 'extended' | null
  latest_support_until: string | null
  support_status: SupportStatus
}

export interface ContactDetail extends ContactWithLatestPurchase {
  purchases: ContactPurchase[]
  tickets: Array<{
    id: number
    ticket_number: string
    subject: string
    status: string
    priority: string
    last_message_at: string | null
    message_count: number
    created_at: string
  }>
}

export interface PurchaseInput {
  purchase_code: string
  license_type?: 'regular' | 'extended'
  item_name?: string | null
  purchase_date?: string | null
  support_until?: string | null
  support_term_months?: number | null
  source?: 'envato' | 'manual'
}

const normalizeEmail = (email: string): string => (email || '').trim().toLowerCase()

/**
 * Official CodeCanyon Item Support Policy:
 * - 6 months of item support included with purchase (authors can offer up to 12)
 * - renewals/extensions are sold in +6 month blocks
 */
export const DEFAULT_SUPPORT_MONTHS = 6
export const EXTENDED_SUPPORT_MONTHS = 12

export function getSupportStatus(supportUntil: string | null | undefined): SupportStatus {
  if (!supportUntil) return 'none'
  const end = new Date(supportUntil)
  if (Number.isNaN(end.getTime())) return 'none'
  return end.getTime() > Date.now() ? 'active' : 'expired'
}

export class ContactService {
  constructor(private db: D1Database) {}

  async upsertContactFromEmail(email: string, name?: string | null): Promise<Contact> {
    const normalized = normalizeEmail(email)
    if (!normalized) throw new Error('Email is required')

    const existing = await first<Contact>(this.db, 'SELECT * FROM contacts WHERE email = ?', normalized)

    if (existing) {
      await run(
        this.db,
        'UPDATE contacts SET name = COALESCE(?, name), last_contact_at = datetime(\'now\'), total_tickets = total_tickets + 1, updated_at = datetime(\'now\') WHERE id = ?',
        name || null,
        existing.id,
      )
      return (await first<Contact>(this.db, 'SELECT * FROM contacts WHERE id = ?', existing.id))!
    }

    const now = new Date().toISOString()
    await run(
      this.db,
      `INSERT INTO contacts (email, name, type, first_contact_at, last_contact_at, total_tickets, created_at, updated_at)
       VALUES (?, ?, 'lead', ?, ?, 1, ?, ?)`,
      normalized,
      name || null,
      now,
      now,
      now,
      now,
    )
    return (await first<Contact>(this.db, 'SELECT * FROM contacts WHERE email = ?', normalized))!
  }

  async getContactByEmail(email: string): Promise<Contact | null> {
    return first<Contact>(this.db, 'SELECT * FROM contacts WHERE email = ?', normalizeEmail(email))
  }

  async getContactById(id: number): Promise<Contact | null> {
    return first<Contact>(this.db, 'SELECT * FROM contacts WHERE id = ?', id)
  }

  async getContactsPaginated(
    page: number,
    limit: number,
    filters: { search?: string; type?: ContactType },
  ): Promise<{ contacts: ContactWithLatestPurchase[]; total: number }> {
    let where = 'WHERE 1=1'
    const params: unknown[] = []
    const countParams: unknown[] = []

    if (filters.type) {
      where += ' AND c.type = ?'
      params.push(filters.type)
      countParams.push(filters.type)
    }

    if (filters.search) {
      where += ' AND (c.email LIKE ? OR c.name LIKE ? OR COALESCE(p.purchase_code, \'\') LIKE ?)'
      const term = `%${filters.search}%`
      params.push(term, term, term)
      countParams.push(term, term, term)
    }

    const listQuery = `
      SELECT c.*,
             p.purchase_code AS latest_purchase_code,
             p.license_type  AS latest_license_type,
             p.support_until AS latest_support_until
      FROM contacts c
      LEFT JOIN contact_purchases p ON p.id = (
        SELECT cp.id FROM contact_purchases cp
        WHERE cp.contact_id = c.id
        ORDER BY cp.support_until DESC, cp.id DESC
        LIMIT 1
      )
      ${where}
      ORDER BY c.last_contact_at DESC, c.id DESC
      LIMIT ? OFFSET ?`
    const countQuery = `SELECT COUNT(*) as total FROM contacts c LEFT JOIN contact_purchases p ON p.contact_id = c.id ${where}`

    const [listResult, countResult] = await this.db.batch([
      this.db.prepare(listQuery).bind(...params, limit, (page - 1) * limit),
      this.db.prepare(countQuery).bind(...countParams),
    ])

    const rows = (listResult.results || []) as Array<Record<string, unknown>>
    const total = (countResult.results?.[0] as { total: number })?.total || 0

    const contacts = rows.map((row) => {
      const contact = row as unknown as Contact
      const latestSupportUntil = (row.latest_support_until as string) || null
      return {
        ...contact,
        latest_purchase_code: (row.latest_purchase_code as string) || null,
        latest_license_type: (row.latest_license_type as 'regular' | 'extended' | null) || null,
        latest_support_until: latestSupportUntil,
        support_status: getSupportStatus(latestSupportUntil),
      }
    })

    return { contacts, total }
  }

  async getContactDetail(id: number): Promise<ContactDetail | null> {
    const contact = await first<Contact>(this.db, 'SELECT * FROM contacts WHERE id = ?', id)
    if (!contact) return null

    const purchases = await all<ContactPurchase>(
      this.db,
      'SELECT * FROM contact_purchases WHERE contact_id = ? ORDER BY support_until DESC, id DESC',
      id,
    )

    const tickets = await all<{
      id: number
      ticket_number: string
      subject: string
      status: string
      priority: string
      last_message_at: string | null
      message_count: number
      created_at: string
    }>(
      this.db,
      `SELECT id, ticket_number, subject, status, priority, last_message_at, message_count, created_at
       FROM tickets WHERE contact_id = ? ORDER BY created_at DESC`,
      id,
    )

    const latest = purchases[0] || null
    return {
      ...contact,
      latest_purchase_code: latest?.purchase_code || null,
      latest_license_type: latest?.license_type || null,
      latest_support_until: latest?.support_until || null,
      support_status: getSupportStatus(latest?.support_until),
      purchases,
      tickets,
    }
  }

  /** Attach a purchase code to a contact and promote them to customer. */
  async addPurchase(contactId: number, input: PurchaseInput): Promise<ContactPurchase> {
    const contact = await this.getContactById(contactId)
    if (!contact) throw new Error('Contact not found')

    const purchaseCode = (input.purchase_code || '').trim()
    if (!purchaseCode) throw new Error('purchase_code is required')
    if (input.license_type && !['regular', 'extended'].includes(input.license_type)) {
      throw new Error('license_type must be regular or extended')
    }

    const existing = await first<ContactPurchase>(
      this.db,
      'SELECT id FROM contact_purchases WHERE purchase_code = ?',
      purchaseCode,
    )
    if (existing) throw new Error('This purchase code is already linked to a contact')

    await run(
      this.db,
      `INSERT INTO contact_purchases (contact_id, purchase_code, license_type, item_name, purchase_date, support_until, support_term_months, source, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
      contactId,
      purchaseCode,
      input.license_type || 'regular',
      input.item_name || null,
      input.purchase_date || null,
      input.support_until || null,
      input.support_term_months || null,
      input.source || 'manual',
    )

    await run(
      this.db,
      "UPDATE contacts SET type = 'customer', updated_at = datetime('now') WHERE id = ?",
      contactId,
    )

    return (await first<ContactPurchase>(
      this.db,
      'SELECT * FROM contact_purchases WHERE purchase_code = ?',
      purchaseCode,
    ))!
  }

  async updatePurchase(purchaseId: number, input: Partial<PurchaseInput>): Promise<ContactPurchase | null> {
    const existing = await first<ContactPurchase>(this.db, 'SELECT * FROM contact_purchases WHERE id = ?', purchaseId)
    if (!existing) return null

    const updates: string[] = []
    const params: unknown[] = []

    if (input.license_type && ['regular', 'extended'].includes(input.license_type)) {
      updates.push('license_type = ?')
      params.push(input.license_type)
    }
    if (input.item_name !== undefined) {
      updates.push('item_name = ?')
      params.push(input.item_name || null)
    }
    if (input.purchase_date !== undefined) {
      updates.push('purchase_date = ?')
      params.push(input.purchase_date || null)
    }
    if (input.support_until !== undefined) {
      updates.push('support_until = ?')
      params.push(input.support_until || null)
    }
    if (input.support_term_months !== undefined) {
      updates.push('support_term_months = ?')
      params.push(input.support_term_months || null)
    }

    if (updates.length === 0) return existing

    updates.push("updated_at = datetime('now')")
    await run(this.db, `UPDATE contact_purchases SET ${updates.join(', ')} WHERE id = ?`, ...params, purchaseId)

    // If the code was changed, keep the unique constraint honest.
    if (input.purchase_code && input.purchase_code.trim() && input.purchase_code.trim() !== existing.purchase_code) {
      await run(
        this.db,
        'UPDATE contact_purchases SET purchase_code = ? WHERE id = ?',
        input.purchase_code.trim(),
        purchaseId,
      )
    }

    return (await first<ContactPurchase>(this.db, 'SELECT * FROM contact_purchases WHERE id = ?', purchaseId))!
  }

  async deletePurchase(purchaseId: number): Promise<{ purchaseDeleted: boolean; contactType: ContactType }> {
    const purchase = await first<ContactPurchase>(this.db, 'SELECT * FROM contact_purchases WHERE id = ?', purchaseId)
    if (!purchase) return { purchaseDeleted: false, contactType: 'lead' }

    await run(this.db, 'DELETE FROM contact_purchases WHERE id = ?', purchaseId)

    const remaining = await first<{ count: number }>(
      this.db,
      'SELECT COUNT(*) as count FROM contact_purchases WHERE contact_id = ?',
      purchase.contact_id,
    )
    const hasMore = (remaining?.count || 0) > 0

    if (!hasMore) {
      await run(
        this.db,
        "UPDATE contacts SET type = 'lead', updated_at = datetime('now') WHERE id = ?",
        purchase.contact_id,
      )
    }

    return { purchaseDeleted: true, contactType: hasMore ? 'customer' : 'lead' }
  }

  async updateContactName(id: number, name: string): Promise<void> {
    await run(this.db, "UPDATE contacts SET name = ?, updated_at = datetime('now') WHERE id = ?", name || null, id)
  }

  async updateContactNotes(id: number, notes: string): Promise<void> {
    await run(this.db, "UPDATE contacts SET notes = ?, updated_at = datetime('now') WHERE id = ?", notes || null, id)
  }

  async deleteContact(id: number): Promise<boolean> {
    const contact = await this.getContactById(id)
    if (!contact) return false
    await run(this.db, 'DELETE FROM contacts WHERE id = ?', id)
    return true
  }
}
