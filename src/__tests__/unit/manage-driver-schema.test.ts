import { z } from 'zod'

const ManageDriverSchema = z.object({
  action: z.enum([
    'approve', 'reject', 'suspend', 'unsuspend', 'deactivate', 'reactivate', 'delete',
    'approve_document',
    'reject_document',
    'delete_rating',
  ]),
  driverId: z.string().min(1),
  reason: z.string().optional(),
  documentKey: z.string().optional(),
  documentRejectionReason: z.string().optional(),
})

describe('ManageDriverSchema', () => {
  it('accepts approve action', () => {
    const result = ManageDriverSchema.safeParse({ action: 'approve', driverId: 'uid123' })
    expect(result.success).toBe(true)
  })

  it('accepts approve_document with documentKey', () => {
    const result = ManageDriverSchema.safeParse({ action: 'approve_document', driverId: 'uid123', documentKey: 'permitConduire' })
    expect(result.success).toBe(true)
  })

  it('accepts reject_document with documentKey and reason', () => {
    const result = ManageDriverSchema.safeParse({
      action: 'reject_document',
      driverId: 'uid123',
      documentKey: 'casierJudiciaire',
      documentRejectionReason: 'Document illisible',
    })
    expect(result.success).toBe(true)
  })

  it('accepts delete_rating', () => {
    const result = ManageDriverSchema.safeParse({ action: 'delete_rating', driverId: 'uid123', documentKey: 'ratingId456' })
    expect(result.success).toBe(true)
  })

  it('rejects unknown action', () => {
    const result = ManageDriverSchema.safeParse({ action: 'unknown_action', driverId: 'uid123' })
    expect(result.success).toBe(false)
  })
})
