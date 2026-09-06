export type Source = { status: string; lastSync: string | null; from: string | null; to: string | null; note?: string; types?: string[]; accountId?: string };
export type AdRow = { date: string; campaignId: string; campaign: string; cost: number; clicks: number; impressions: number; conversions: number; purchases: number; purchaseValue: number };
export type CommerceRow = { date: string; orders: number; paidOrders: number; recordedPaidValue: number; cancelledOrders: number; completedOrders: number; refundValue: number };
export type EventRow = { id: string; at: string; type: string; count: number; channel: string };
export type SeoRow = { date: string; clicks: number; impressions: number; position: number };
export type ReportData = { version: number; workspace: string; environment: string; currency: string; timezone: string; generatedAt: string | null; sources: Record<string, Source>; ads: AdRow[]; commerce: CommerceRow[]; events: EventRow[]; seo: SeoRow[] };
