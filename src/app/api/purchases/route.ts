/**
 * GET /api/purchases — the caller's suggestion purchases (latest first).
 * Powers the student dashboard "আমার সাজেশন" section. Includes the linked
 * material (never the heavy fileData) + success flag for download buttons.
 */
import { db } from '@/lib/db'
import { fail, isResponse, ok, requireAuth } from '@/lib/api-helpers'

export async function GET(req: Request) {
  try {
    const auth = await requireAuth(req)
    if (isResponse(auth)) return auth

    const purchases = await db.suggestionPurchase.findMany({
      where: { userId: auth.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        amount: true,
        method: true,
        status: true,
        trxId: true,
        invoiceNo: true,
        payStatus: true,
        adminNote: true,
        createdAt: true,
        suggestion: {
          select: {
            id: true,
            title: true,
            description: true,
            category: true,
            isFree: true,
            price: true,
            fileName: true,
            fileType: true, // preview dialog: PDF vs image vs other
            fileSize: true,
            fileUrl: true, // only used to compute hasFile below — never returned
            downloads: true,
            createdAt: true, // "আপলোড" date in the preview header
          },
        },
      },
    })

    // Additive: fileType + hasFile for the dashboard preview button.
    return ok({
      purchases: purchases.map(({ suggestion, ...rest }) => {
        if (!suggestion) return rest
        const { fileUrl, ...safeSuggestion } = suggestion
        return { ...rest, suggestion: { ...safeSuggestion, hasFile: Boolean(safeSuggestion.fileName || fileUrl) } }
      }),
    })
  } catch (err) {
    console.error('[GET /api/purchases]', err)
    return fail('Server error', 500)
  }
}
