import { NextResponse } from 'next/server';
import { z } from 'zod';
import { rateLimit, clientIp } from '@/lib/security/rateLimit';

// This endpoint is unauthenticated and relays to an external Apps Script, so it
// validates + bounds every field AND rate-limits per IP to limit spam-relay abuse.
const contactSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(200),
  phone: z.string().trim().max(40).optional().default(''),
  message: z.string().trim().min(1).max(5000),
});

export async function POST(request: Request) {
    const rl = rateLimit(`contact:${clientIp(request.headers)}`, { limit: 5, windowMs: 10 * 60 * 1000 });
    if (!rl.ok) {
        return NextResponse.json(
            { success: false, error: 'Too many messages. Please try again in a few minutes.' },
            { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
        );
    }

    let raw: unknown;
    try {
        raw = await request.json();
    } catch {
        return NextResponse.json({ success: false, error: 'Invalid request.' }, { status: 400 });
    }

    // Honeypot: real users never fill `website`. A filled value = bot → pretend
    // success (so it doesn't retry) but drop the message without relaying.
    if (
        raw &&
        typeof raw === 'object' &&
        typeof (raw as Record<string, unknown>).website === 'string' &&
        ((raw as Record<string, unknown>).website as string).trim() !== ''
    ) {
        return NextResponse.json({ success: true });
    }

    const parsed = contactSchema.safeParse(raw);
    if (!parsed.success) {
        return NextResponse.json(
            { success: false, error: 'Please fill in all fields correctly.' },
            { status: 400 },
        );
    }
    const { name, email, phone, message } = parsed.data;

    const GOOGLE_SCRIPT_URL = process.env.GOOGLE_SCRIPT_URL;
    if (!GOOGLE_SCRIPT_URL) {
        return NextResponse.json(
            { success: false, error: 'Server configuration error.' },
            { status: 500 }
        );
    }

    try {
        const response = await fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            redirect: 'follow',
            body: JSON.stringify({ name, email, phone, message }),
            // Apps Script web apps can hang on cold start — bound the wait so this
            // route returns its own error instead of a platform timeout.
            signal: AbortSignal.timeout(10000),
        });

        if (!response.ok) {
            throw new Error('Failed to reach Google Script');
        }

        const text = await response.text();
        let result;
        try {
            result = JSON.parse(text);
        } catch {
            result = { success: true };
        }

        if (result.success || result.result === 'success') {
            return NextResponse.json({ success: true });
        }
        return NextResponse.json(
            { success: false, error: result.error || 'Unknown error' },
            { status: 500 }
        );
    } catch {
        return NextResponse.json(
            { success: false, error: 'Internal Server Error' },
            { status: 500 }
        );
    }
}
