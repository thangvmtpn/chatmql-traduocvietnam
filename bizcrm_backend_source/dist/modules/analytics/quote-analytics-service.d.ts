import { buildFunnel, rankUsers } from './quote-analytics-calc.js';
export interface QuoteAnalytics {
    kpi: {
        totalCreated: number;
        totalSent: number;
        winRate: number;
        wonValue: number;
        /** Giá trị đang chờ khách trả lời — dự báo dòng tiền */
        pipelineValue: number;
        avgDealSize: number;
        avgDaysToClose: number | null;
    };
    funnel: ReturnType<typeof buildFunnel>;
    trend: Array<{
        period: string;
        count: number;
        value: number;
    }>;
    byUser: ReturnType<typeof rankUsers>;
    topProducts: Array<{
        name: string;
        quantity: number;
        value: number;
        quotes: number;
    }>;
    rejectionReasons: Array<{
        reason: string;
        count: number;
    }>;
}
export declare function getQuoteAnalytics(orgId: string, from: Date, to: Date): Promise<QuoteAnalytics>;
